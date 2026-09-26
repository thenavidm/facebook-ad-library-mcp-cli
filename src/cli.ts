/**
 * The CLI adapter, copied from the house template (dev:mcp-cli, assets/cli.ts).
 *
 * `register()` in tools/kit.ts turns a spec into an MCP tool. This turns the
 * same spec into a shell command, from the same `ALL_TOOLS` array, through the
 * same handler. Nothing is described twice, so a tool added tomorrow is a
 * command tomorrow.
 *
 * Three seams differ from the template, because this server differs:
 *   - every tool reads a public archive, so there is no WriteGuard and no risk
 *     level to check;
 *   - the context holds a backend, which may be a whole Chromium, so it is
 *     closed after the one call a command makes;
 *   - `view_ad_creative` returns images, which a terminal cannot show, so the
 *     CLI prints its text and lists each image instead.
 */

import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadConfig } from "./config.js";
import { AdLibraryError } from "./errors.js";
import { ALL_TOOLS } from "./tools/index.js";
import { makeContext, type AnyToolSpec, type ToolResult } from "./tools/kit.js";

/** How a value reaches the parser, once the Zod wrappers are peeled off. */
type FlagKind = "string" | "number" | "boolean" | "enum" | "json";

type Flag = {
  /** The schema key, e.g. `reply_control`. */
  key: string;
  /** The long flag, e.g. `--reply-control`. */
  flag: string;
  kind: FlagKind;
  required: boolean;
  repeatable: boolean;
  choices?: string[];
  help: string;
};

/**
 * Peel `.optional()`, `.default()` and `.nullable()` to reach the real type.
 *
 * A description can sit on either the wrapper or the inner type depending on
 * the order the tool author chained them, so both are collected on the way
 * down and the outermost one wins.
 */
function unwrap(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean; description?: string } {
  let inner = schema;
  let optional = false;
  let description = schema.description;

  for (;;) {
    const typeName = (inner as { _def: { typeName?: string } })._def.typeName;
    if (typeName === "ZodOptional" || typeName === "ZodDefault" || typeName === "ZodNullable") {
      if (typeName !== "ZodNullable") optional = true;
      inner = (inner as unknown as { _def: { innerType: ZodTypeAny } })._def.innerType;
      description ??= inner.description;
      continue;
    }
    return { inner, optional, description };
  }
}

function kindOf(schema: ZodTypeAny): { kind: FlagKind; choices?: string[]; repeatable: boolean } {
  const typeName = (schema as { _def: { typeName?: string } })._def.typeName;

  switch (typeName) {
    case "ZodString":
      return { kind: "string", repeatable: false };
    case "ZodNumber":
      return { kind: "number", repeatable: false };
    case "ZodBoolean":
      return { kind: "boolean", repeatable: false };
    case "ZodEnum":
      return {
        kind: "enum",
        choices: (schema as unknown as { _def: { values: string[] } })._def.values,
        repeatable: false,
      };
    case "ZodArray": {
      // An array of scalars is repeatable (`--text a --text b`). An array of
      // objects is not worth flattening, so it takes JSON.
      const element = unwrap((schema as unknown as { _def: { type: ZodTypeAny } })._def.type).inner;
      const elementKind = (element as { _def: { typeName?: string } })._def.typeName;
      // An enum element is a word you type, so it belongs with the scalars.
      const scalar =
        elementKind === "ZodString" || elementKind === "ZodNumber" || elementKind === "ZodEnum";
      return { kind: scalar ? "string" : "json", repeatable: true };
    }
    default:
      // Objects, unions, records and anything else take a JSON literal.
      return { kind: "json", repeatable: false };
  }
}

/** Turn one schema entry into a flag. */
function toFlag(key: string, schema: ZodTypeAny): Flag {
  const { inner, optional, description } = unwrap(schema);
  const { kind, choices, repeatable } = kindOf(inner);
  return {
    key,
    flag: `--${key.replace(/_/g, "-")}`,
    kind,
    required: !optional,
    repeatable,
    choices,
    help: description ?? "",
  };
}

export function flagsFor(shape: ZodRawShape): Flag[] {
  return Object.entries(shape).map(([key, schema]) => toFlag(key, schema as ZodTypeAny));
}

class UsageError extends Error {}

/** Accept a flag as `--foo-bar`, `--foo_bar`, or `foo_bar`. */
function normalize(token: string): string {
  return token.replace(/^--/, "").replace(/-/g, "_");
}

function coerce(flag: Flag, raw: string): unknown {
  switch (flag.kind) {
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new UsageError(`${flag.flag} expects a number, got '${raw}'.`);
      return value;
    }
    case "enum":
      if (flag.choices && !flag.choices.includes(raw)) {
        throw new UsageError(`${flag.flag} expects one of: ${flag.choices.join(", ")}. Got '${raw}'.`);
      }
      return raw;
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        throw new UsageError(`${flag.flag} expects JSON, got '${raw}'.`);
      }
    default:
      return raw;
  }
}

/**
 * Parse argv against a tool's flags.
 *
 * Zod does the real validation afterwards, so this only has to get the values
 * into the right JavaScript types and catch the mistakes Zod would report in
 * terms of a schema the person at the terminal never sees.
 */
export function parseArgs(argv: string[], flags: Flag[]): Record<string, unknown> {
  const byKey = new Map(flags.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    // `--flag=value` and `--flag value` are both normal to type.
    const equals = token.indexOf("=");
    const name = normalize(equals === -1 ? token : token.slice(0, equals));
    const flag = byKey.get(name);
    if (!flag) throw new UsageError(`Unknown option ${token}.`);

    if (flag.kind === "boolean") {
      if (equals !== -1) {
        const value = token.slice(equals + 1);
        out[flag.key] = value !== "false" && value !== "0";
      } else {
        out[flag.key] = true;
      }
      continue;
    }

    const raw = equals === -1 ? argv[++i] : token.slice(equals + 1);
    if (raw === undefined) throw new UsageError(`${flag.flag} expects a value.`);
    const value = coerce(flag, raw);

    if (flag.repeatable) {
      (out[flag.key] as unknown[]) = [...((out[flag.key] as unknown[]) ?? []), value];
    } else {
      out[flag.key] = value;
    }
  }

  // One bare argument fills the first required flag, so `search-posts "cats"`
  // works the way anyone would expect it to before reading any help.
  if (positional.length > 0) {
    const target = flags.find((f) => f.required && out[f.key] === undefined);
    if (!target) throw new UsageError(`Unexpected argument '${positional[0]}'.`);
    if (positional.length > 1) throw new UsageError(`Unexpected argument '${positional[1]}'.`);
    const value = coerce(target, positional[0] as string);
    out[target.key] = target.repeatable ? [value] : value;
  }

  return out;
}

/* ------------------------------------------------------------------ output */

type Format = "text" | "json" | "compact";

/** Exit codes, so a script can branch without parsing the message. */
export const EXIT = {
  ok: 0, usage: 2, notFound: 3, auth: 4, api: 5, rateLimited: 7, config: 10,
} as const;

/**
 * Map a thrown error onto one of those.
 *
 * AdLibraryError carries no status, only a message that names the fix, so the
 * words decide. They are this repo's own messages, listed in the tests.
 */
export function exitCodeFor(error: unknown): number {
  const text = String((error as Error)?.message ?? "").toLowerCase();
  if (/^pass either|unknown backend/.test(text)) return EXIT.usage;
  if (/not configured|no [a-z ]*token is configured|needs (a|an) (token|api key)|not installed/.test(text)) return EXIT.config;
  if (/rejected the|\(401\)|\(403\)|refused the run|error 190/.test(text)) return EXIT.auth;
  if (/out of credits|insufficient credit|\(402\)|\(429\)|rate ?limit/.test(text)) return EXIT.rateLimited;
  if (/not found|no ad with/.test(text)) return EXIT.notFound;
  return EXIT.api;
}

/**
 * `--select id,post.title` keeps only the named fields. Dotted paths descend,
 * arrays are traversed element-wise. This is what makes a long feed affordable.
 */
export function selectFields(data: unknown, paths: string[]): unknown {
  if (Array.isArray(data)) return data.map((d) => selectFields(d, paths));
  if (data === null || typeof data !== "object") return data;

  // Paths are grouped by their first segment before recursing. Walking them one
  // at a time and assigning `out[head]` each time meant the last path won:
  // `--select posts.uri,posts.text` returned only the text, silently.
  const byHead = new Map<string, string[]>();
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    if (head === undefined) continue;
    const group = byHead.get(head) ?? [];
    if (rest.length) group.push(rest.join("."));
    byHead.set(head, group);
  }

  const out: Record<string, unknown> = {};
  for (const [head, rest] of byHead) {
    const value = (data as Record<string, unknown>)[head];
    if (value === undefined) continue;
    out[head] = rest.length ? selectFields(value, rest) : value;
  }
  return out;
}

/**
 * Print a handler result.
 *
 * Reading tools already return the tagged text from `format/`, which is the
 * shaped-for-a-model output and is just as readable in a terminal. Writing
 * tools return a small object. `--json` forces JSON either way so a script
 * never has to know which kind of tool it called.
 */
function emit(data: unknown, format: Format): void {
  if (format === "text" && typeof data === "string") {
    process.stdout.write(data.endsWith("\n") ? data : `${data}\n`);
    return;
  }
  const json = format === "compact" ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  process.stdout.write(`${json}\n`);
}

/** Errors are JSON on stderr, always, so a caller parses one shape. */
function emitError(error: unknown): void {
  const payload =
    error instanceof AdLibraryError
      ? error.toJSON()
      : { error: (error as Error)?.message ?? String(error) };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
}

/* -------------------------------------------------------------------- help */

function commandName(tool: string): string {
  return tool.replace(/_/g, "-");
}

/** Where help text starts, when the flag is short enough to leave room. */
const COLUMN = 34;

/**
 * The name this was invoked as, so examples are copy-pasteable.
 *
 * The package ships two binaries onto the same file. Printing
 * `facebook-ad-library-mcp` at someone who typed `facebook-ad-library-cli`
 * hands them a command that works but is not
 * the one they have in their fingers.
 */
function binName(): string {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("facebook-ad-library-cli") ? "facebook-ad-library-cli" : "facebook-ad-library-mcp";
}

function renderToolHelp(spec: AnyToolSpec): string {
  const flags = flagsFor(spec.schema);
  const required = flags.filter((f) => f.required);
  const optional = flags.filter((f) => !f.required);

  const usage = [
    `${binName()} ${commandName(spec.name)}`,
    ...required.map((f) => `${f.flag} <${f.kind}>`),
    optional.length > 0 ? "[options]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [``, spec.description.trim(), ``, `Usage:`, `  ${usage}`, ``];

  const describe = (list: Flag[], heading: string): void => {
    if (list.length === 0) return;
    lines.push(`${heading}:`);
    for (const f of list) {
      const placeholder = f.kind === "boolean" ? "" : ` <${f.choices ? f.choices.join("|") : f.kind}>`;
      const left = `  ${f.flag}${placeholder}`;
      const help = f.repeatable ? `${f.help} Repeatable.` : f.help;
      if (!help) {
        lines.push(left);
      } else if (left.length < COLUMN) {
        lines.push(`${left.padEnd(COLUMN)}${help}`);
      } else {
        // A long enum spelled out in the placeholder would push the help off
        // the line, so it gets its own.
        lines.push(left, `${" ".repeat(COLUMN)}${help}`);
      }
    }
    lines.push(``);
  };

  describe(required, "Required");
  describe(optional, "Options");

  lines.push(`Output:`);
  lines.push(`  --json                          force JSON`);
  lines.push(`  --compact                       force single-line JSON`);
  lines.push(`  --agent                         machine mode: JSON, compact, no prompts, no colour`);
  lines.push(`  --select <a,b.c>                keep only these fields, dotted paths descend`);
  lines.push(``);
  lines.push(`Reads a public archive. Nothing here writes.`);
  lines.push(``);
  return lines.join("\n");
}

function renderToolList(tools: AnyToolSpec[]): string {
  const width = Math.max(...tools.map((t) => commandName(t.name).length)) + 2;
  const bin = binName();
  const lines = [``, `${bin} commands (${tools.length})`, ``];
  for (const tool of tools) {
    lines.push(`    ${commandName(tool.name).padEnd(width)}${tool.title}`);
  }
  lines.push(``);
  lines.push(`  Every command reads a public archive. Nothing writes.`);
  lines.push(``);
  lines.push(`  ${bin} <command> --help    what it takes`);
  lines.push(`  ${bin} schema <command>    the JSON schema an MCP client sees`);
  lines.push(``);
  return lines.join("\n");
}

/* ---------------------------------------------------------------- dispatch */

/** Every tool reads, so there is nothing for a read-only switch to hide. */
function visibleTools(): AnyToolSpec[] {
  return ALL_TOOLS;
}

/**
 * A result a terminal can show. Images come back as base64 content blocks,
 * which would fill the screen, so each one becomes a line saying what it was.
 */
function forTerminal(spec: AnyToolSpec, result: unknown): unknown {
  if (!spec.returnsContent) return result;
  const blocks = (result as ToolResult).content ?? [];
  const text = blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const images = blocks
    .filter((b) => b.type === "image")
    .map((b) => {
      const image = b as { data: string; mimeType: string };
      return `[image ${image.mimeType}, ${Math.round((image.data.length * 3) / 4 / 1024)} KB, not shown in a terminal]`;
    });
  return [text, ...images].filter(Boolean).join("\n");
}

export function isCliCommand(argv: string[]): boolean {
  const first = argv[0];
  if (!first || first.startsWith("-")) return false;
  if (first === "tools" || first === "schema") return true;
  const name = normalize(first);
  return ALL_TOOLS.some((tool) => tool.name === name);
}

export async function runCli(argv: string[]): Promise<number> {
  const config = loadConfig();
  const tools = visibleTools();

  const command = argv[0] as string;
  const rest = argv.slice(1);

  if (command === "tools") {
    process.stdout.write(renderToolList(tools));
    return 0;
  }

  if (command === "schema") {
    const wanted = normalize(rest[0] ?? "");
    const spec = tools.find((t) => t.name === wanted);
    if (!spec) {
      emitError(new Error(`Unknown command '${rest[0] ?? ""}'. Run \`${binName()} tools\`.`));
      return EXIT.usage;
    }
    // The same JSON Schema an MCP client receives, so the two surfaces are
    // provably one. Emitting the Zod object instead printed its internals
    // (`_def`, `~standard`), which is not a schema anyone can consume.
    emit(zodToJsonSchema(z.object(spec.schema).describe(spec.description)), "json");
    return 0;
  }

  const name = normalize(command);
  const spec = tools.find((t) => t.name === name);
  if (!spec) {
    emitError(new Error(`Unknown command '${command}'. Run \`${binName()} tools\`.`));
    return EXIT.usage;
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(renderToolHelp(spec));
    return 0;
  }

  // `--agent` is the whole machine-readable posture in one flag, so an agent
  // does not have to remember four and silently forget one.
  const agent = rest.includes("--agent");
  const format: Format =
    rest.includes("--compact") || agent ? "compact" : rest.includes("--json") ? "json" : "text";

  const selectAt = rest.findIndex((t) => t === "--select" || t.startsWith("--select="));
  const selectRaw =
    selectAt === -1
      ? undefined
      : (rest[selectAt] as string).includes("=")
        ? (rest[selectAt] as string).split("=").slice(1).join("=")
        : rest[selectAt + 1];
  const select = selectRaw?.split(",").map((f) => f.trim()).filter(Boolean);

  const consumed = new Set(["--json", "--compact", "--agent", "--no-color", "--no-input", "--yes"]);
  const toolArgv = rest.filter((token, i) => {
    if (consumed.has(token)) return false;
    if (token === "--select" || token.startsWith("--select=")) return false;
    if (selectAt !== -1 && i === selectAt + 1 && !(rest[selectAt] as string).includes("=")) return false;
    return true;
  });

  const ctx = makeContext(config);
  try {
    const parsed = parseArgs(toolArgv, flagsFor(spec.schema));
    // Zod is the authority on validity, exactly as it is for an MCP call.
    const args = z.object(spec.schema).parse(parsed);

    const result = forTerminal(spec, await spec.handler(args as never, ctx));
    emit(select?.length ? selectFields(result, select) : result, format);
    return EXIT.ok;
  } catch (error) {
    if (error instanceof UsageError) {
      emitError(error);
      if (!agent) process.stderr.write(renderToolHelp(spec));
      return EXIT.usage;
    }
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      emitError(new Error(first ? `${first.path.join(".") || "argument"}: ${first.message}` : error.message));
      return EXIT.usage;
    }
    emitError(error);
    return exitCodeFor(error);
  } finally {
    // The browser backend is a whole Chromium. One command, one call, then shut.
    await ctx.backend.close().catch(() => undefined);
  }
}

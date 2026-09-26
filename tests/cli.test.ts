/**
 * The CLI adapter.
 *
 * What matters here is that the shell surface is derived from the tool specs
 * rather than described a second time, so the tests that count are the ones
 * asserting parity with ALL_TOOLS and the ones covering the argv shapes a
 * person actually types.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EXIT, exitCodeFor, flagsFor, parseArgs, isCliCommand } from "../src/cli.js";
import { AdLibraryError } from "../src/errors.js";
import { ALL_TOOLS } from "../src/tools/index.js";

describe("flagsFor", () => {
  it("derives a flag per schema key, kebab-cased", () => {
    const flags = flagsFor({ reply_to: z.string().optional() });
    expect(flags[0]).toMatchObject({ key: "reply_to", flag: "--reply-to", kind: "string" });
  });

  it("reads required from the absence of .optional()", () => {
    const flags = flagsFor({ text: z.string(), account: z.string().optional() });
    expect(flags.find((f) => f.key === "text")?.required).toBe(true);
    expect(flags.find((f) => f.key === "account")?.required).toBe(false);
  });

  it("carries .describe() through as help", () => {
    const flags = flagsFor({ text: z.string().describe("The post body.") });
    expect(flags[0]?.help).toBe("The post body.");
  });

  it("finds the description whichever side of .optional() it was chained", () => {
    const outer = flagsFor({ a: z.string().optional().describe("outer") });
    const inner = flagsFor({ b: z.string().describe("inner").optional() });
    expect(outer[0]?.help).toBe("outer");
    expect(inner[0]?.help).toBe("inner");
  });

  it("exposes an enum's values as choices", () => {
    const flags = flagsFor({ reply_control: z.enum(["everyone", "nobody"]).optional() });
    expect(flags[0]).toMatchObject({ kind: "enum", choices: ["everyone", "nobody"] });
  });

  it("marks a scalar array repeatable and an object array json", () => {
    const flags = flagsFor({
      langs: z.array(z.string()).optional(),
      images: z.array(z.object({ url: z.string() })).optional(),
    });
    expect(flags.find((f) => f.key === "langs")).toMatchObject({ kind: "string", repeatable: true });
    expect(flags.find((f) => f.key === "images")).toMatchObject({ kind: "json", repeatable: true });
  });
});

describe("parseArgs", () => {
  const flags = flagsFor({
    text: z.string(),
    limit: z.number().optional(),
    confirm: z.boolean().optional(),
    langs: z.array(z.string()).optional(),
    link: z.object({ uri: z.string() }).optional(),
    reply_control: z.enum(["everyone", "nobody"]).optional(),
  });

  it("accepts --flag value and --flag=value alike", () => {
    expect(parseArgs(["--text", "hi"], flags)).toEqual({ text: "hi" });
    expect(parseArgs(["--text=hi"], flags)).toEqual({ text: "hi" });
  });

  it("accepts the underscore spelling of a flag", () => {
    expect(parseArgs(["--reply_control", "nobody"], flags)).toEqual({ reply_control: "nobody" });
  });

  it("treats a boolean as a bare switch", () => {
    expect(parseArgs(["--text", "hi", "--confirm"], flags)).toEqual({ text: "hi", confirm: true });
    expect(parseArgs(["--confirm=false"], flags)).toEqual({ confirm: false });
  });

  it("coerces numbers, and refuses ones that are not", () => {
    expect(parseArgs(["--limit", "25"], flags)).toEqual({ limit: 25 });
    expect(() => parseArgs(["--limit", "many"], flags)).toThrow(/expects a number/);
  });

  it("parses a json flag, and refuses malformed json", () => {
    expect(parseArgs(['--link={"uri":"https://x.com"}'], flags)).toEqual({
      link: { uri: "https://x.com" },
    });
    expect(() => parseArgs(["--link", "{oops"], flags)).toThrow(/expects JSON/);
  });

  it("collects a repeatable flag into an array", () => {
    expect(parseArgs(["--langs", "en", "--langs", "sv"], flags)).toEqual({ langs: ["en", "sv"] });
  });

  it("checks an enum against its choices", () => {
    expect(() => parseArgs(["--reply-control", "friends"], flags)).toThrow(/expects one of/);
  });

  it("fills the first required flag from a bare argument", () => {
    expect(parseArgs(["hello"], flags)).toEqual({ text: "hello" });
  });

  it("wraps a bare argument when the required flag is repeatable", () => {
    const repeatable = flagsFor({ actors: z.array(z.string()) });
    expect(parseArgs(["bsky.app"], repeatable)).toEqual({ actors: ["bsky.app"] });
  });

  it("refuses an unknown option rather than dropping it", () => {
    expect(() => parseArgs(["--nope", "x"], flags)).toThrow(/Unknown option/);
  });

  it("refuses a second bare argument", () => {
    expect(() => parseArgs(["one", "two"], flags)).toThrow(/Unexpected argument/);
  });
});

describe("parity with the MCP surface", () => {
  it("routes every tool name, in both spellings", () => {
    for (const tool of ALL_TOOLS) {
      expect(isCliCommand([tool.name])).toBe(true);
      expect(isCliCommand([tool.name.replace(/_/g, "-")])).toBe(true);
    }
  });

  it("builds flags for every tool without throwing", () => {
    for (const tool of ALL_TOOLS) {
      expect(() => flagsFor(tool.schema)).not.toThrow();
    }
  });

  it("gives every schema key a flag", () => {
    for (const tool of ALL_TOOLS) {
      expect(flagsFor(tool.schema)).toHaveLength(Object.keys(tool.schema).length);
    }
  });

  it("leaves the server's own flags alone", () => {
    expect(isCliCommand(["--http"])).toBe(false);
    expect(isCliCommand(["--version"])).toBe(false);
    expect(isCliCommand([])).toBe(false);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> => new Set(text.match(/FBADS_[A-Z_]+/g) ?? []);

  /**
   * Two variables shipped undocumented and five never reached `--help`, which is
   * the kind of drift nobody notices because both sides look complete on their own.
   */
  it("documents every environment variable the code reads", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    const documented = names(read("../README.md"));
    expect([...used].filter((v) => !documented.has(v))).toEqual([]);
  });

  it("lists every environment variable in --help", () => {
    const used = names(["config.ts", "transport/http.ts"].map((f) => read(`../src/${f}`)).join("\n"));
    const helped = names(read("../src/index.ts"));
    // The help groups the three HTTP ones as `FBADS_HTTP_PORT / _HOST / _TOKEN`.
    const shorthand = new Set(["FBADS_HTTP_HOST", "FBADS_HTTP_TOKEN"]);
    expect([...used].filter((v) => !helped.has(v) && !shorthand.has(v))).toEqual([]);
  });

  /**
   * Two in-page links pointed at headings that had been renamed, including the
   * one row routing a shell user to the CLI. The ship checklist's link pass only
   * greps http, so a dead `#anchor` is the kind that ships quietly.
   */
  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    const md = read(file);
    const slugs = new Set<string>();
    for (const [, heading] of md.matchAll(/^#{2,4} (.+)$/gm)) {
      const stripped = (heading as string).toLowerCase().replace(/[^\w\s-]/g, "");
      // GitHub keeps the trailing hyphen when a heading ends in an emoji.
      slugs.add(stripped.trim().replace(/\s+/g, "-"));
      slugs.add(stripped.replace(/\s+/g, "-"));
    }
    // GitHub keeps combining marks in a slug, so an emoji's variation selector
    // (U+FE0F) survives in the anchor, percent-encoded in a link.
    for (const [, heading] of md.matchAll(/^#{2,4} (.+)$/gm)) {
      slugs.add((heading as string).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "").replace(/\s/g, "-"));
    }
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)]
      .map((m) => decodeURIComponent(m[1] as string))
      .filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});

describe("exit codes follow the house contract", () => {
  const code = (message: string): number => exitCodeFor(new AdLibraryError(message));

  it("a missing argument is 2", () => {
    expect(code("Pass either query or page_ids.")).toBe(EXIT.usage);
  });

  it("a backend that is not set up is 10", () => {
    expect(code("No Meta Ad Library API token is configured.")).toBe(EXIT.config);
    expect(code("The scrapecreators backend needs an API key.")).toBe(EXIT.config);
    expect(code("The browser backend needs Playwright, which is not installed.")).toBe(EXIT.config);
  });

  it("a rejected key is 4", () => {
    expect(code("ScrapeCreators rejected the key (401).")).toBe(EXIT.auth);
    expect(code("Apify refused the run (403): forbidden")).toBe(EXIT.auth);
  });

  it("running out of credits is 7", () => {
    expect(code("ScrapeCreators is out of credits (402).")).toBe(EXIT.rateLimited);
  });

  it("anything else from upstream is 5", () => {
    expect(code("Apify error 500: upstream")).toBe(EXIT.api);
  });
});

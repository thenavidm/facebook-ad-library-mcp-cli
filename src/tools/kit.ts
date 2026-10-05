/**
 * Shared plumbing every tool uses, now on Slipway.
 *
 * Tool modules keep describing themselves with a Zod shape and a handler. This
 * adapter turns each into a Slipway tool, so the MCP server, the CLI,
 * annotations and errors all come from the framework instead of a copy kept in
 * this repo.
 */

import {
  ApiError,
  AuthError,
  NotConfiguredError,
  NotFoundError,
  RateLimitError,
  SlipwayError,
  UsageError,
  content,
  image,
  text,
  toolkit,
  z,
  type ContentResult,
  type Tool,
} from "@thenavidm/slipway";
import type { Backend } from "../adlibrary/types.js";
import type { Config } from "../config.js";
import { AdLibraryError } from "../errors.js";
import { createBackend } from "../backends/index.js";
import { SnapshotStore } from "../store/snapshots.js";

export type ToolContext = {
  backend: Backend;
  config: Config;
  store: SnapshotStore;
};

const kit = toolkit<ToolContext>();

/** The context every tool call gets, built one way for both surfaces. */
export function makeContext(config: Config): ToolContext {
  return { backend: createBackend(config), config, store: new SnapshotStore(config.storeDir) };
}

/** What a tool that builds its own result returns: content blocks, with the data alongside. */
export type ToolResult = ContentResult;

/**
 * A result carrying real images alongside the text.
 *
 * The text block still goes first so a client that ignores images, and the
 * model itself, still get the context: which advertiser, which ad, what the
 * copy said. The images follow in the same order they are described. A
 * terminal cannot show them, so the CLI prints the text and one line per image.
 */
export function okWithImages(data: unknown, images: { data: string; mimeType: string }[]): ToolResult {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return content([text(body), ...images.map((i) => image(i.data, i.mimeType))]);
}

/**
 * 0.5 picked an exit code by reading the message, and a provider's error
 * carries no status, so the same words decide here: a call made wrong is 2,
 * setup still to do 10, a rejected key 4, a provider out of credits or rate
 * limiting 7, an ad that is not there 3, and anything else upstream, 5. A bug
 * in this code stays 1. The provider's own hint and the backend ride along.
 */
type ErrorOptions = NonNullable<ConstructorParameters<typeof ApiError>[1]>;

const RULES: Array<[RegExp, new (message: string, options?: ErrorOptions) => SlipwayError]> = [
  [/^pass either|unknown backend/, UsageError],
  [/not configured|no [a-z ]*token is configured|needs (a|an) (token|api key)|not installed/, NotConfiguredError],
  [/rejected the|\(401\)|\(403\)|refused the run|error 190/, AuthError],
  [/out of credits|insufficient credit|\(402\)|\(429\)|rate ?limit/, RateLimitError],
  [/not found|no ad with/, NotFoundError],
];

const BUGS = new Set<unknown>([TypeError, ReferenceError, RangeError]);

export function toSlipway(error: unknown): unknown {
  if (error instanceof SlipwayError || !(error instanceof Error) || BUGS.has(error.constructor)) return error;
  const options: ErrorOptions = {
    cause: error,
    ...(error instanceof AdLibraryError && error.hint ? { hint: error.hint } : {}),
    ...(error instanceof AdLibraryError && error.backend ? { details: { backend: error.backend } } : {}),
  };
  const words = error.message.toLowerCase();
  for (const [pattern, Kind] of RULES) if (pattern.test(words)) return new Kind(error.message, options);
  return new ApiError(error.message, options);
}

/** Filters shared by every tool that searches. Described once, reused everywhere. */
export const searchArgs = {
  country: z
    .string()
    .length(2)
    .optional()
    .describe("Two-letter country the ads were delivered in, e.g. US, GB, DE. Default US."),
  active_status: z
    .enum(["active", "inactive", "all"])
    .optional()
    .describe("Only ads running now, only stopped ads, or both. Default active."),
  media_type: z
    .enum(["all", "image", "meme", "video", "none"])
    .optional()
    .describe("Filter by creative type. 'meme' is Meta's name for an image with text on it."),
  ad_type: z
    .enum([
      "all",
      "political_and_issue_ads",
      "employment_ads",
      "housing_ads",
      "financial_products_and_services_ads",
    ])
    .optional()
    .describe("Ad category. 'all' covers ordinary commercial ads and is what you usually want."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("How many ads to return. On the browser backend a higher number costs more time."),
};

type Shape = Record<string, z.ZodType>;

export type ToolSpec<S extends Shape, O extends Shape = Shape> = {
  name: string;
  /** One line, imperative. Shown in tool pickers. */
  title: string;
  description: string;
  schema: S;
  /** Declared so clients get `structuredContent` rather than a JSON string. */
  outputSchema?: O;
  /**
   * Set when the handler builds its own result, for the tools that return
   * something other than JSON. Images, mainly: those go back as content blocks
   * and cannot be serialized into one object.
   */
  returnsContent?: boolean;
  /**
   * Every tool in this server reads a public archive. None of them writes, so
   * `readOnlyHint` is true throughout and there is no confirm gating to apply.
   * `openWorldHint` is false only where a tool touches no network at all.
   */
  touchesNetwork?: boolean;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
};

export type AnyToolSpec = Tool<ToolContext>;

export function defineTool<S extends Shape, O extends Shape = Shape>(spec: ToolSpec<S, O>): Tool<ToolContext> {
  const handler = spec.handler as (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  return kit.defineTool({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    input: z.object(spec.schema as Shape),
    ...(spec.outputSchema ? { output: z.object(spec.outputSchema as Shape) } : {}),
    risk: "read",
    idempotent: true,
    openWorld: spec.touchesNetwork !== false,
    handler: async (args, ctx) => {
      try {
        // The output schema, when there is one, was declared beside this handler and is checked at run time.
        return (await handler(args, ctx)) as never;
      } catch (error) {
        throw toSlipway(error);
      } finally {
        // A command makes one call, and an open Chromium would keep the process
        // alive after it, so the CLI closes the backend each time, as 0.5 did.
        // The server keeps it open between calls.
        if (ctx.surface === "cli") await ctx.backend.close().catch(() => undefined);
      }
    },
  });
}

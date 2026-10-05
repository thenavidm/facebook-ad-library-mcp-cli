/**
 * The two surfaces, now that Slipway builds both from ALL_TOOLS.
 *
 * Parsing, help and the exit-code contract are Slipway's and tested there. What
 * matters here: every tool arrives on both surfaces intact, under 0.5's command
 * names; the resources and prompts still reach a client; the provider errors
 * keep their exit codes; the CLI closes the browser after its one call; and the
 * docs stay in step with the code.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "@thenavidm/slipway";
import { checkApp, cli, connect } from "@thenavidm/slipway/testing";
import { app } from "../src/app.js";
import { AdLibraryError } from "../src/errors.js";
import { ALL_TOOLS } from "../src/tools/index.js";
import { toSlipway } from "../src/tools/kit.js";

afterEach(() => vi.restoreAllMocks());

describe("Meta Ad Library on Slipway", () => {
  it("offers every tool as a command and over MCP, under the same names", async () => {
    const list = await cli(app, [], { env: {} });
    for (const tool of ALL_TOOLS) expect(list.stdout).toContain(tool.command);
    const mcp = await connect(app, { env: {} });
    const tools = await mcp.listTools();
    await mcp.close();
    expect(tools.map((tool) => tool.name)).toEqual(ALL_TOOLS.map((tool) => tool.name));
    // Every tool reads a public archive; only the two that touch no network say so.
    for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    const closedWorld = tools.filter((tool) => tool.annotations?.openWorldHint === false).map((tool) => tool.name).sort();
    expect(closedWorld).toEqual(["ad_library_url", "backend_status"]);
  });

  it("serves the config and concepts resources, and both prompts with their argument", async () => {
    const mcp = await connect(app, { env: {} });
    const resources = (await mcp.request("resources/list")) as { resources: Array<{ uri: string }> };
    const config = (await mcp.request("resources/read", { uri: "fbads://config" })) as { contents: Array<{ text: string }> };
    const prompt = (await mcp.request("prompts/get", { name: "competitor-teardown", arguments: { brand: "Acme" } })) as { messages: Array<{ content: { text: string } }> };
    const prompts = (await mcp.request("prompts/list")) as { prompts: Array<{ name: string }> };
    await mcp.close();
    expect(resources.resources.map((r) => r.uri).sort()).toEqual(["fbads://concepts", "fbads://config"]);
    expect(JSON.parse(config.contents[0]!.text)).toMatchObject({ backend: "browser", costs_money_per_request: false });
    expect(prompts.prompts.map((p) => p.name)).toEqual(["competitor-teardown", "creative-angles"]);
    expect(prompt.messages[0]!.content.text).toContain('Call list_advertisers for "Acme"');
  });

  it("returns structured data for a tool that declares it, and closes the backend after a CLI call", async () => {
    const run = await cli(app, ["backend-status", "--json"], { env: {} });
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ backend: "browser", needs_api_key: false });
    const mcp = await connect(app, { env: {} });
    const result = await mcp.callTool("backend_status", {});
    await mcp.close();
    expect(result.structuredContent).toMatchObject({ backend: "browser" });
  });

  it("exits 2 for a missing argument, and 10 for a provider backend with no key", async () => {
    expect((await cli(app, ["search-ads"], { env: {} })).code).toBe(EXIT.usage);
    const run = await cli(app, ["search-ads", "--query", "shoes"], { env: { FBADS_BACKEND: "scrapecreators" } });
    expect(run.code).toBe(EXIT.notConfigured);
    expect(JSON.parse(run.stderr).hint).toContain("SCRAPECREATORS_API_KEY");
  });

  it("passes slipway check", async () => {
    const report = await checkApp(app, { env: {} });
    expect(report.findings.filter((finding) => finding.level === "error")).toEqual([]);
  });
});

describe("exit codes follow the house contract", () => {
  const code = (message: string): number => (toSlipway(new AdLibraryError(message)) as { exitCode: number }).exitCode;

  it("a missing argument is 2", () => {
    expect(code("Pass either query or page_ids.")).toBe(EXIT.usage);
  });

  it("a backend that is not set up is 10", () => {
    expect(code("No Meta Ad Library API token is configured.")).toBe(EXIT.notConfigured);
    expect(code("The scrapecreators backend needs an API key.")).toBe(EXIT.notConfigured);
    expect(code("The browser backend needs Playwright, which is not installed.")).toBe(EXIT.notConfigured);
  });

  it("a rejected key is 4", () => {
    expect(code("ScrapeCreators rejected the key (401).")).toBe(EXIT.auth);
    expect(code("Apify refused the run (403): forbidden")).toBe(EXIT.auth);
  });

  it("running out of credits is 7", () => {
    expect(code("ScrapeCreators is out of credits (402).")).toBe(EXIT.rateLimited);
  });

  it("anything else from upstream is 5, a library's own error too", () => {
    expect(code("Apify error 500: upstream")).toBe(EXIT.api);
    class BrowserTimeout extends Error {}
    expect((toSlipway(new BrowserTimeout("page.goto: Timeout 60000ms exceeded")) as { exitCode: number }).exitCode).toBe(EXIT.api);
  });

  it("keeps the provider's hint and backend", () => {
    const known = toSlipway(new AdLibraryError("ScrapeCreators is out of credits (402).", { hint: "Top up the account.", backend: "scrapecreators" })) as { hint: string; details: unknown };
    expect(known.hint).toBe("Top up the account.");
    expect(known.details).toEqual({ backend: "scrapecreators" });
  });

  it("leaves a bug in this code as unexpected", () => {
    expect(toSlipway(new TypeError("x is undefined"))).toBeInstanceOf(TypeError);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  const names = (text: string): Set<string> =>
    new Set((text.match(/\b(FBADS|SCRAPECREATORS|APIFY|META_ADS)_[A-Z_]+/g) ?? []).filter((name) => !name.endsWith("_")));
  const source = (dir: string): string =>
    readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? source(`${dir}${entry.name}/`) : entry.name.endsWith(".ts") ? read(`${dir}${entry.name}`) : ""))
      .join("\n");

  /** Every variable the server reads: this repo's code, and Slipway's as agent-context lists them. */
  const used = async (): Promise<Set<string>> => {
    const context = JSON.parse((await cli(app, ["agent-context"], { env: {} })).stdout);
    return new Set([...names(source("../src/")), ...context.settings.map((setting: { env: string }) => setting.env)]);
  };

  /**
   * Two variables shipped undocumented and five never reached `--help`, which is
   * the kind of drift nobody notices because both sides look complete on their own.
   */
  it("documents every environment variable the code reads", async () => {
    const documented = names(read("../README.md"));
    expect([...(await used())].filter((v) => !documented.has(v))).toEqual([]);
  });

  // Since Slipway 0.1.15 the help names the settings that connect an account and the safety
  // switches, and counts the rest, which agent-context describes one by one.
  it("names every environment variable in --help or agent-context", async () => {
    const help = (await cli(app, ["--help"], { env: {} })).stdout;
    const context = JSON.parse((await cli(app, ["agent-context"], { env: {} })).stdout);
    const described = new Set(context.settings.map((setting: { env: string }) => setting.env));
    expect([...(await used())].filter((v) => !help.includes(v) && !described.has(v))).toEqual([]);
  });

  /**
   * Two in-page links pointed at headings that had been renamed, including the
   * one row routing a shell user to the CLI. The ship checklist's link pass only
   * greps http, so a dead `#anchor` is the kind that ships quietly.
   */
  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return; // repo may ship one doc
    const md = read(file).replace(/```[\s\S]*?```/g, "");
    // GitHub's slug keeps letters, marks, numbers and connector punctuation, so an
    // emoji's variation selector (U+FE0F) stays in the anchor and a link has to carry it.
    const slugs = new Set(
      [...md.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        (heading as string).trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "").replace(/ /g, "-"),
      ),
    );
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)]
      .map((m) => decodeURIComponent(m[1] as string))
      .filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});

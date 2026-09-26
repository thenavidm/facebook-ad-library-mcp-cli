#!/usr/bin/env node
/**
 * Entry point.
 *
 * `facebook-ad-library-mcp`          stdio, which is what MCP clients launch
 * `facebook-ad-library-mcp --http`   HTTP, for running it somewhere always on
 * `facebook-ad-library-mcp doctor`   check the setup and say what is wrong
 * `facebook-ad-library-cli`          every tool as a shell command
 *
 * One entry point, two programs. `facebook-ad-library-mcp` is the server and
 * must stay silent on stdout, which is the protocol channel. The CLI is picked
 * by the name it was invoked as, or by a first argument that names a tool.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { isCliCommand, runCli } from "./cli.js";
import { buildServer, VERSION } from "./server.js";
import { httpOptionsFromEnv, startHttpServer } from "./transport/http.js";

const HELP = `facebook-ad-library-mcp ${VERSION}

  facebook-ad-library-mcp                     Run over stdio. This is what an MCP client launches.
  facebook-ad-library-mcp --http [--port=N]   Run over HTTP, for a machine that is always on.
  facebook-ad-library-mcp doctor              Check the setup and report what is wrong.
  facebook-ad-library-mcp --version           Print the version.
  facebook-ad-library-cli                     List every tool as a shell command.
  facebook-ad-library-cli <command> --help    What one command takes.

Backends. The default needs no key and no account:
  FBADS_BACKEND=browser           free, drives Chromium locally. Default.
  FBADS_BACKEND=scrapecreators    needs SCRAPECREATORS_API_KEY. Works serverless.
  FBADS_BACKEND=apify             needs APIFY_TOKEN. Works serverless.

Optional:
  META_ADS_ARCHIVE_TOKEN          unlocks EU spend, reach and demographics. Free from Meta.
  FBADS_HEADED=1                  show the browser, to see why a search came back empty
  FBADS_STORE_DIR                 where diff_advertiser keeps its snapshots
  FBADS_HYDRATE_MS                how long to let the page load, default 9000
  FBADS_SCROLL_WAIT_MS            pause between scrolls, default 4000
  FBADS_RETRIES                   retries when the browser comes back empty, default 1
  FBADS_CACHE_DAYS                how old a ScrapeCreators cached answer may be, default 1
  FBADS_HTTP_PORT / _HOST / _TOKEN  for --http

https://github.com/thenavidm/facebook-ad-library-mcp-cli
`;

function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("facebook-ad-library-cli");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (invokedAsCli() && argv.length === 0) {
    process.exitCode = await runCli(["tools"]);
    return;
  }

  // Checked before --help and --version so `<tool> --help` reaches the tool.
  if (isCliCommand(argv)) {
    process.exitCode = await runCli(argv);
    return;
  }

  // An unknown word would otherwise fall through and start the server, which
  // then waits on stdin: a typo looks like a hang. `doctor` and `help` belong
  // to the entry point, and they are what someone types when nothing works.
  const ENTRY_COMMANDS = new Set(["doctor", "help"]);
  if (invokedAsCli() && command !== undefined && !command.startsWith("-") && !ENTRY_COMMANDS.has(command)) {
    process.stderr.write(
      `${JSON.stringify({ error: `Unknown command '${command}'. Run \`facebook-ad-library-cli\` to list them.` }, null, 2)}\n`,
    );
    process.exitCode = 2;
    return;
  }

  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "doctor") {
    const { runDoctor } = await import("./doctor.js");
    process.exitCode = await runDoctor();
    return;
  }

  const config = loadConfig();
  const built = buildServer(config);

  // Warn, never block. Checking a provider key over the network at startup would
  // delay the handshake, and the failure is more actionable on the call that hits it.
  if (config.backend === "scrapecreators" && !config.scrapeCreatorsKey) {
    process.stderr.write(
      "[facebook-ad-library-mcp] FBADS_BACKEND=scrapecreators but SCRAPECREATORS_API_KEY is not set. Run `facebook-ad-library-mcp doctor`.\n",
    );
  }
  if (config.backend === "apify" && !config.apifyToken) {
    process.stderr.write(
      "[facebook-ad-library-mcp] FBADS_BACKEND=apify but APIFY_TOKEN is not set. Run `facebook-ad-library-mcp doctor`.\n",
    );
  }

  const shutdown = async (close?: () => Promise<void>): Promise<void> => {
    if (close) await close().catch(() => undefined);
    await built.close().catch(() => undefined);
    process.exit(0);
  };

  if (argv.includes("--http")) {
    const { close } = await startHttpServer(built, httpOptionsFromEnv(argv));
    process.on("SIGTERM", () => void shutdown(close));
    process.on("SIGINT", () => void shutdown(close));
    return;
  }

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  // Handled so `docker stop` and a client shutting down return promptly, and so
  // Chromium is closed rather than left running.
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(`[facebook-ad-library-mcp] ${(error as Error).message}\n`);
  process.exit(1);
});

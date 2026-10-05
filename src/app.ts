/**
 * The Meta Ad Library app: everything Slipway needs to ship the MCP server and the CLI.
 *
 * This file only describes. It never starts anything, so `slipway check` and
 * tests can import it; `index.ts` is what runs.
 */

import { createRequire } from "node:module";
import { slipway } from "@thenavidm/slipway";
import { loadConfig } from "./config.js";
import { doctor } from "./doctor.js";
import { INSTRUCTIONS, PROMPTS, RESOURCES } from "./guide.js";
import { ALL_TOOLS } from "./tools/index.js";
import { makeContext, toSlipway, type ToolContext } from "./tools/kit.js";

const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;

export const app = slipway<ToolContext>({
  name: "facebook-ad-library",
  title: "Meta Ad Library",
  version: VERSION,
  package: "@thenavidm/facebook-ad-library-mcp-cli",
  description: "Meta's public Ad Library: every ad running on Facebook, Instagram, Messenger and Threads, for any advertiser, in any country",
  // 0.5's settings were FBADS_, and every client config already says so.
  envPrefix: "FBADS",
  instructions: INSTRUCTIONS,
  // A provider backend checks its key as it is built, and its message names the variable to set, so that error keeps its own hint.
  context: (env) => {
    try {
      return makeContext(loadConfig(env));
    } catch (error) {
      throw toSlipway(error);
    }
  },
  secrets: ({ config }) => [config.scrapeCreatorsKey, config.apifyToken, config.archiveToken],
  tools: ALL_TOOLS,
  resources: [
    {
      name: "ad-library-config",
      uri: "fbads://config",
      mimeType: "application/json",
      read: ({ backend, config }) => ({
        backend: backend.name,
        costs_money_per_request: backend.needsKey,
        eu_transparency_available: Boolean(config.archiveToken),
        transcription_available: typeof backend.transcribe === "function",
      }),
    },
    ...RESOURCES.map(({ text, ...resource }) => ({ ...resource, read: () => text })),
  ],
  prompts: PROMPTS,
  doctor,
  // Chromium launching, and Meta answering, only show by trying, so doctor reads a test search every time, as 0.5 did.
  doctorNetwork: true,
  // Warn, never block. Checking a provider key over the network at startup would
  // delay the handshake, and the failure is more actionable on the call that hits it.
  onServe: ({ config }, log) => {
    if (config.backend === "scrapecreators" && !config.scrapeCreatorsKey) {
      log.warn("FBADS_BACKEND=scrapecreators but SCRAPECREATORS_API_KEY is not set. Run `facebook-ad-library-cli doctor`.");
    }
    if (config.backend === "apify" && !config.apifyToken) {
      log.warn("FBADS_BACKEND=apify but APIFY_TOKEN is not set. Run `facebook-ad-library-cli doctor`.");
    }
  },
  login:
    "The default browser backend needs no account, only `npx playwright install chromium`. For a provider that runs anywhere, set FBADS_BACKEND=scrapecreators with SCRAPECREATORS_API_KEY, or FBADS_BACKEND=apify with APIFY_TOKEN. META_ADS_ARCHIVE_TOKEN adds EU spend and reach. Run `facebook-ad-library-cli doctor` to check.",
  settings: [
    { env: "FBADS_BACKEND", description: "browser, free and the default; scrapecreators; or apify." },
    { env: "SCRAPECREATORS_API_KEY", description: "For FBADS_BACKEND=scrapecreators.", secret: true },
    { env: "APIFY_TOKEN", description: "For FBADS_BACKEND=apify.", secret: true },
    { env: "META_ADS_ARCHIVE_TOKEN", description: "EU spend, reach and demographics. Free from Meta.", secret: true },
    { env: "APIFY_ACTOR", description: "lite, the default, or full for enrichment.", tuning: true },
    { env: "FBADS_HEADED", description: "1 shows the browser, to see why a search came back empty.", tuning: true },
    { env: "FBADS_STORE_DIR", description: "Where diff_advertiser keeps its snapshots.", tuning: true },
    { env: "FBADS_HYDRATE_MS", description: "How long to let the page load; 9000 when unset.", tuning: true },
    { env: "FBADS_SCROLL_WAIT_MS", description: "Pause between scrolls; 4000 when unset.", tuning: true },
    { env: "FBADS_RETRIES", description: "Retries when the browser comes back empty; 1 when unset.", tuning: true },
    { env: "FBADS_CACHE_DAYS", description: "How old a ScrapeCreators cached answer may be; 1 when unset.", tuning: true },
  ],
  links: { repository: "https://github.com/thenavidm/facebook-ad-library-mcp-cli" },
});

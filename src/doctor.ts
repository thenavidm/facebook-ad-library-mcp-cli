/**
 * `facebook-ad-library-cli doctor`
 *
 * The command someone runs when a tool came back empty and they cannot tell
 * whether the problem is their setup, Meta, or the search itself. It answers
 * that without needing an MCP client attached. Slipway runs these on every
 * `doctor`, as 0.5 did, after its own checks.
 */

import type { DoctorCheck } from "@thenavidm/slipway";
import { buildUrl } from "./adlibrary/url.js";
import { inlinePayloads, parsePayloads } from "./adlibrary/harvest.js";
import type { ToolContext } from "./tools/kit.js";

type Check = { label: string; ok: boolean; detail: string };

async function checkPlaywright(): Promise<Check> {
  try {
    await import("playwright");
  } catch {
    return {
      label: "Playwright",
      ok: false,
      detail: "Not installed. Run `npx playwright install chromium`, or use a provider backend.",
    };
  }
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return { label: "Playwright", ok: true, detail: "Chromium launches." };
  } catch (error) {
    return {
      label: "Playwright",
      ok: false,
      detail: `Installed, but Chromium will not launch: ${(error as Error).message}. Run \`npx playwright install chromium\`.`,
    };
  }
}

/** The check that matters: can we actually read ads right now. */
async function checkLiveRead(): Promise<Check> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const bodies: string[] = [];
      page.on("response", (response: any) => {
        if (String(response.url()).includes("/api/graphql")) {
          void response.text().then((b: string) => bodies.push(b)).catch(() => undefined);
        }
      });
      await page.goto(buildUrl({ query: "shoes", country: "US" }), {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(9000);
      bodies.push(...inlinePayloads(await page.content()));
      const harvest = parsePayloads(bodies);
      if (harvest.captcha) {
        return {
          label: "Live read",
          ok: false,
          detail: "Meta served a captcha. Wait a few minutes, or use a provider backend.",
        };
      }
      if (harvest.nodes.length === 0) {
        return {
          label: "Live read",
          ok: false,
          detail: "Connected, but no ads parsed. Meta may be rate limiting this machine.",
        };
      }
      return {
        label: "Live read",
        ok: true,
        detail: `Read ${harvest.nodes.length} ads for a test search.`,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return { label: "Live read", ok: false, detail: (error as Error).message };
  }
}

export async function doctor({ config }: ToolContext): Promise<DoctorCheck[]> {
  const checks: Check[] = [];

  checks.push({
    label: "Backend",
    ok: true,
    detail: `${config.backend}${config.backend === "browser" ? " (free, no key)" : " (bills per ad)"}`,
  });

  if (config.backend === "browser") {
    const playwright = await checkPlaywright();
    checks.push(playwright);
    if (playwright.ok) checks.push(await checkLiveRead());
  }

  if (config.backend === "scrapecreators") {
    checks.push({
      label: "SCRAPECREATORS_API_KEY",
      ok: Boolean(config.scrapeCreatorsKey),
      detail: config.scrapeCreatorsKey ? "Set." : "Not set. Get one at scrapecreators.com.",
    });
  }

  if (config.backend === "apify") {
    checks.push({
      label: "APIFY_TOKEN",
      ok: Boolean(config.apifyToken),
      detail: config.apifyToken ? "Set." : "Not set. Get one from your Apify account settings.",
    });
  }

  checks.push({
    label: "META_ADS_ARCHIVE_TOKEN",
    ok: true,
    detail: config.archiveToken
      ? "Set. get_eu_transparency will return EU spend and reach."
      : "Not set. Optional: everything works without it except get_eu_transparency.",
  });

  // The archive token is optional, so a missing one is a note rather than a fault.
  return checks.map(({ label, ok, detail }) => ({ name: label, ok, detail, ...(label === "META_ADS_ARCHIVE_TOKEN" && !config.archiveToken ? { warn: true } : {}) }));
}

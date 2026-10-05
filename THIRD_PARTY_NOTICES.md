# Third party notices

The source in this repository is MIT licensed. These production dependencies keep their own licenses, and the desktop bundle ships each one's license file with it:

| Dependency | License |
|---|---|
| [@thenavidm/slipway](https://github.com/thenavidm/slipway) | Apache-2.0 |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) and its `core` package | Apache-2.0 |
| [zod](https://github.com/colinhacks/zod) | MIT |
| [playwright](https://github.com/microsoft/playwright), optional, for the free browser backend | Apache-2.0 |

The Chromium that Playwright drives is installed separately, with `npx playwright install chromium`, under its own licenses. The ScrapeCreators, Apify and Meta APIs are reached with Node's built-in `fetch`.

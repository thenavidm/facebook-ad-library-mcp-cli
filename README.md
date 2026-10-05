<img src="https://cdn.navid.me/connectors/facebook-ad-library-icon.png" alt="Facebook Ad Library" width="88">

# Facebook Ad Library MCP Server & CLI

[![Stars](https://img.shields.io/github/stars/thenavidm/facebook-ad-library-mcp-cli?style=flat&logo=github&label=Stars)](https://github.com/thenavidm/facebook-ad-library-mcp-cli)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@thenavidm/facebook-ad-library-mcp-cli?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/facebook-ad-library-mcp-cli)
[![Downloads](https://img.shields.io/npm/dm/@thenavidm/facebook-ad-library-mcp-cli?color=green&label=downloads)](https://www.npmjs.com/package/@thenavidm/facebook-ad-library-mcp-cli)
[![CI](https://img.shields.io/github/actions/workflow/status/thenavidm/facebook-ad-library-mcp-cli/ci.yml?branch=main&label=CI)](https://github.com/thenavidm/facebook-ad-library-mcp-cli/actions)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-thenavidm-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/thenavidm)

Facebook Ad Library MCP server and CLI for Claude Code, Codex and AI agents. 9 tools that read every ad running on Facebook, Instagram, Messenger, Threads and Audience Network, for any advertiser in any country, free and with no API key.

One install gives you both surfaces, the same 9 tools under the same names, reading one array of tool definitions so they cannot drift apart.

Meta's Ad Library is the largest public archive of advertising creative in the world, and it is completely open. This puts it inside your agent.

> **You:** What is Ridge testing right now?
>
> **Claude:** They have 34 ads live. The oldest has run 214 days: a single static
> image, "The last wallet you will buy", straight to a product page. The eleven
> newest are all video with a founder talking to camera, and every one of them
> points at a quiz funnel instead. They are moving from product-led to
> problem-led, and the old ad is still running because it still works.

Built by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=facebook-ad-library-mcp-cli&utm_content=readme). Built on [Slipway](https://github.com/thenavidm/slipway), which turns one definition of each tool into the MCP server and the CLI.

<img src="https://cdn.navid.me/repos/facebook-ad-library-mcp.gif" alt="Claude Code using the Facebook Ad Library MCP server" width="520">

## Two ways to use it

### Command line

`facebook-ad-library-cli` runs every tool as a command. Agents that run
commands, like Claude Code, Codex and OpenCode, use it on their own, and you can
type the same commands in a terminal, a script or a cron job:

```bash
facebook-ad-library-cli                                   # every command, one line each
facebook-ad-library-cli list-advertisers --query ridge    # find a brand's Page ID
facebook-ad-library-cli search-ads --page-id 123456789 --country US
facebook-ad-library-cli search-ads --query "wallet" --json --select ads.library_id,ads.days_active
facebook-ad-library-cli ad-library-url --query "wallet" --country GB
facebook-ad-library-cli <command> --help                  # what any command takes
```

Every command reads a public archive, so nothing needs `--confirm`. `--json`
gives JSON, `--compact` puts it on one line, `--select` keeps only the fields
you name, and `--agent` is compact JSON with no prompts. Exit codes are 0 ok,
1 an unexpected error, 2 usage, 3 not found, 4 a rejected key, 5 upstream, 7 out
of credits and 10 a backend that is not set up, so a script branches on the
number.

`facebook-ad-library-cli schema <command>` prints the exact JSON Schema an MCP
client receives for that tool.

### MCP server, for your AI app

`facebook-ad-library-mcp` is what Claude Code, Claude Desktop, Cursor and the
rest launch. You never run it by hand:

```bash
claude mcp add facebook-ad-library -- npx -y @thenavidm/facebook-ad-library-mcp-cli
```

In Claude Desktop, the [`.mcpb` extension](https://github.com/thenavidm/facebook-ad-library-mcp-cli/releases/latest)
installs on a double click. Section 4 has every other client.

### Which one

| Where you are | What you can reach |
|---|---|
| An agent that can run shell commands, like Claude Code or Cursor | Both. The CLI is the cheaper one: it costs nothing until you type it |
| claude.ai, the Claude Desktop chat tab, or a phone | The server only. There is no shell to run a command in |
| A terminal, a script, cron or CI | The CLI only. There is no MCP client in a shell |

They are the same program reading the same tool definitions, so anything one can
do, the other can.

### What each costs

Both surfaces are the same program with the same 9 tools. The
difference is when the model pays for them. Measured in Claude Code:

| Cost | MCP server | CLI |
|---|---|---|
| Every message, with every tool loaded | 3,900 tokens | nothing |
| Every message, Claude Code's default | 740 tokens | nothing |
| When the Ad Library comes up | nothing more, or the tools it picks | 3,400 tokens for `SKILL.md`, once |
| 20 messages with the Ad Library in 1, every tool loaded | 78,000 tokens | 3,400 tokens |

Claude Code's [tool search](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search)
is on by default: it sends only the tool names and the server instructions,
and loads a tool's full definition when the model reaches for it. An app that
loads every tool up front pays the first line on every message, whether
the Ad Library comes up or not. With the skill added, Claude Code also lists its
one-line description, about 170 tokens.

To spend less, turn the server off when you are not using it, which in Claude
Code is the `/mcp` panel.
Or install the CLI and add the server on the days it earns its place.

Measured on 2026-10-05 with Claude Code 2.1.286 on Claude Opus 5.5: one
short prompt with and without the server connected, once with
`ENABLE_TOOL_SEARCH=false` and once with the default, the difference read
from the API's own usage figures. `SKILL.md` was measured the same way. Other
apps and models count tokens a little differently.

Against 0.5.1, measured the same day: every tool loaded costs 3,894 tokens
instead of 4,190, tool search 737 against 735, within what two runs of the
same build vary by, and `SKILL.md` the same within 4 tokens. In Codex 0.159.3
on gpt-6.1-sol, the same task, "find the command that turns a brand name into
the advertiser's Facebook Page ID, and the flags it requires", read a median of
82,997 input tokens on 0.6.0 against 83,018 on 0.5.1 over the CLI, and 45,167
against 45,180 over MCP, five runs each. Codex prints the tool list with a
script and reads it, 5,839 tokens on both versions.

## Features

Every tool is both a command and an MCP tool, with the same name. The command
is the tool name with dashes.

| Capability | CLI command | MCP tool |
|---|---|---|
| Search ads by keyword or advertiser | `facebook-ad-library-cli search-ads` | `search_ads` |
| Find a brand's Page ID | `facebook-ad-library-cli list-advertisers` | `list_advertisers` |
| Read one ad in full, or look at its images | `facebook-ad-library-cli get-ad` / `view-ad-creative` | `get_ad` / `view_ad_creative` |
| Transcribe a video ad | `facebook-ad-library-cli transcribe-ad` | `transcribe_ad` |
| See what an advertiser started and stopped | `facebook-ad-library-cli diff-advertiser` | `diff_advertiser` |
| EU spend, reach and demographics | `facebook-ad-library-cli get-eu-transparency` | `get_eu_transparency` |
| A link a person can open | `facebook-ad-library-cli ad-library-url` | `ad_library_url` |
| Check your setup | `facebook-ad-library-cli doctor` | `backend_status` |

All nine are in [section 6](#6-tools-%EF%B8%8F).

## Contents

| # | Section | What is in it |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | One command, no account |
| 3 | [Setup](#3-setup-) | Optional, and why you probably do not need it |
| 4 | [Connect your client](#4-connect-your-client-) | Every client, copy and paste |
| 5 | [Check it worked](#5-check-it-worked-) | `doctor`, and what actually fails |
| 6 | [Tools](#6-tools-%EF%B8%8F) | All nine, and what each reaches |
| 7 | [How it works](#7-how-it-works-%EF%B8%8F) | Why it returns more than a scraper |
| 8 | [Limits, honestly](#8-limits-honestly-) | What no source can tell you |
| 9 | [FAQ](#9-faq-) | Including what an MCP server is |

## 1. What you can ask it 💬

- "What ads is Ridge running right now, and which has been live longest?"
- "Show me every hook Athletic Greens is testing this month, grouped by angle."
- "Compare two competitors: who runs more creative, and who refreshes it faster?"
- "Find advertisers running cold plunge ads in the UK, ranked by ad count."
- "Pull every ad from this Page and tell me which landing pages they send to."
- "What changed for this advertiser since last week?"
- "Which of these are video and which are static? Give me the video URLs."
- "This ad has run 8 months. Read the copy and tell me why it works."
- "What is this German brand spending, and who is paying for it?"

## 2. Quick install ⚡

Node 22 or newer. Nothing else.

```bash
npx -y @thenavidm/facebook-ad-library-mcp-cli --version
```

The free backend drives a real browser, so install Chromium once:

```bash
npx playwright install chromium
```

That is the whole install. No account, no API key, no credential.

For the CLI as a command you or your agent can run anywhere, install it once:

```bash
npm install -g @thenavidm/facebook-ad-library-mcp-cli
facebook-ad-library-cli
```

## 3. Setup 🔑

**There is nothing to set up.** The default backend needs no key and no account.

Everything below is optional, and only worth doing if you hit a specific limit.

### Optional: a provider key, for speed and scale

The free backend runs Chromium on your machine, so a search takes 30 to 60 seconds and Meta will rate limit you if you hammer it. Two hosted providers remove both problems for money.

| Backend | Roughly | Adds |
|---|---|---|
| `scrapecreators` | $1.88 per 1,000 ads | fast, serverless, `transcribe_ad` |
| `apify` | $3.40 to $5.80 per 1,000 ads | fast, serverless, e-commerce enrichment |

Set `FBADS_BACKEND` and the matching key in your client config. Every tool behaves identically on all three.

### Optional: EU spend and reach

Meta's official Ad Library API publishes real spend, impressions and demographics. It is free, and it covers political and issue ads worldwide plus every ad delivered in the EU.

1. Go to [developers.facebook.com](https://developers.facebook.com) and create an app.
2. Generate an access token for it.
3. Set it as `META_ADS_ARCHIVE_TOKEN`.

`get_eu_transparency` then returns data. Everything else works without it.

## 4. Connect your client 🔌

The long version, every step with what to do when one fails, is in [INSTALL.md](INSTALL.md).

### Claude Code

```bash
claude mcp add facebook-ads -- npx -y @thenavidm/facebook-ad-library-mcp-cli@latest
```

`--scope user` makes it available in every project rather than the current one.

With a provider key:

```bash
claude mcp add facebook-ads \
  -e FBADS_BACKEND=scrapecreators \
  -e SCRAPECREATORS_API_KEY=xxx \
  -- npx -y @thenavidm/facebook-ad-library-mcp-cli@latest
```

### Claude Desktop

The short way: download the [`.mcpb` extension](https://github.com/thenavidm/facebook-ad-library-mcp-cli/releases/latest)
from the latest release and double-click it. It carries its own dependencies,
and Claude Desktop asks which backend to use. The free browser backend still
needs Chromium installed once with `npx playwright install chromium`; the
scrapecreators and apify backends need only their key.

The long way, if you would rather edit the config yourself:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "facebook-ads": {
      "command": "npx",
      "args": ["-y", "@thenavidm/facebook-ad-library-mcp-cli@latest"]
    }
  }
}
```

> **Tip**
> Claude Desktop does not inherit your shell PATH. If `npx` is not found, use
> the absolute path from `which npx`.

Quit Claude Desktop completely and reopen it.

### claude.ai on the web

claude.ai runs connectors from Anthropic's cloud, not from your machine, so it needs a public HTTPS URL.

```bash
npx -y @thenavidm/facebook-ad-library-mcp-cli@latest --http --port 8000
```

Host that somewhere with a public HTTPS URL, then in claude.ai: **Customize**, **Connectors**, **+**, **Add custom connector**. Paste the URL and click **Add**. A page from another site is refused unless `FBADS_HTTP_ALLOWED_ORIGINS` lists it.

Note the free backend needs a real browser, so whatever hosts it must be able to run Chromium. A provider backend is the easier choice for a hosted deployment.

### Cursor

`.cursor/mcp.json`, same JSON shape as Claude Desktop, key `mcpServers`.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`, key `mcpServers`.

### VS Code

`.vscode/mcp.json`. The key is **`servers`**, not `mcpServers`, and each entry takes `"type": "stdio"`.

```json
{
  "servers": {
    "facebook-ads": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thenavidm/facebook-ad-library-mcp-cli@latest"]
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.facebook-ads]
command = "npx"
args = ["-y", "@thenavidm/facebook-ad-library-mcp-cli@latest"]
```

### Gemini CLI

`~/.gemini/settings.json`, key `mcpServers`.

### Everything else

Any stdio MCP client takes the same three things: the command `npx`, the args, and an optional env block.

Or let the CLI write the entry, in each client's own format:

```bash
npx -y -p @thenavidm/facebook-ad-library-mcp-cli facebook-ad-library-cli install claude-code
```

It takes `claude-code`, `codex`, `claude-desktop`, `cursor`, `vscode` or `gemini`, and `--dry-run` shows the change first.

## 5. Check it worked 🩺

```bash
npx -y @thenavidm/facebook-ad-library-mcp-cli@latest doctor
```

It launches a browser, runs a real search, and tells you whether ads came back.

| Symptom | Fix |
|---|---|
| "Chromium will not launch" | `npx playwright install chromium` |
| "Meta served a captcha" | Wait a few minutes, or set a provider key |
| Empty results on every search | Meta is rate limiting this machine |
| Server missing from the client | `npx` not on the client's PATH, use an absolute path |

## 6. Tools 🛠️

Every tool is read-only. This server cannot post, cannot spend, and cannot reach an ad account.

| Tool | What it does |
|---|---|
| `search_ads` | Keyword search, or every ad from one Page. The main one. |
| `list_advertisers` | Resolve a brand name to Page IDs, ranked by ad count. |
| `get_ad` | One ad in full: every creative, every copy variant. |
| `diff_advertiser` | What an advertiser started and stopped running since last look. |
| `get_eu_transparency` | Spend, reach and demographics. EU and political ads only. |
| `transcribe_ad` | Speech to text on a video ad. Needs the `scrapecreators` backend. |
| `backend_status` | Which backend is active and whether it costs money. |
| `view_ad_creative` | The ad's actual images, so the model can see them rather than only read the copy. |
| `ad_library_url` | Turn filters into a URL a person can open and check. |

Plus two prompts, `competitor-teardown` and `creative-angles`, and two resources so a client can read the config and the Ad Library's own concepts without spending a tool call.

`diff_advertiser` is the one worth knowing about. Every other tool answers "what is running". That one answers "what changed", which needs a memory of last time. The first call records a baseline.

## 7. How it works ⚙️

Worth knowing, because it explains what you get back.

The Ad Library is a React app. Meta hands it every ad as structured JSON. The obvious way to scrape it is to let the page render, flatten it to text, and pull the fields back out with regular expressions.

That round trip loses most of the ad. You get one creative instead of the six in the carousel, a redirect instead of the real landing page, and an empty platform list because those render as icons rather than text.

**This server reads the JSON the page was already given.** Same browser, same cost, no parsing step.

It reads two places, because Meta uses two: the first page of results is embedded in the document, and later pages arrive over the wire as you scroll. Reading only the second is why scrapers return nothing on the first search.

What that buys you, per ad:

| | |
|---|---|
| Creatives | all of them, with HD and SD video URLs |
| Platforms | `Facebook, Instagram, Messenger, Threads, Audience Network` |
| Destination | the real URL, query string intact |
| Call to action | `SHOP_NOW`, from the payload rather than matched against a label list |
| Pagination | a real cursor, plus Meta's own total result count |
| Also | page likes, ad format, variant count, EU spend and reach |

## 8. Limits, honestly 🧭

**No performance data exists.** Conversions, revenue, cost per acquisition, return on ad spend: none of it is public for another advertiser, from any source, at any price.

What you can infer is longevity. An ad running six months is probably working, because advertisers turn off ads that lose money. That is a hypothesis worth acting on, and it is not a measurement. The server's own instructions tell the model not to report it as one.

**Spend and reach are usually null.** They exist only for ads delivered in the EU, under the Digital Services Act, and for political ads anywhere. A null on a US ecommerce ad is the correct answer, not a bug.

**The free backend gets rate limited.** It drives a real browser against a public site. If searches start coming back empty, wait. That is also the point where a provider key starts paying for itself.

**Creative URLs expire.** Meta's CDN links are short-lived. Download what you want to keep, when you find it.

## 9. FAQ ❓

<details>
<summary><b>What is an MCP server?</b></summary>

An MCP server is a standard way to give an AI assistant real tools. Once this is connected, your assistant can search the Ad Library itself instead of you copying results into a chat.

</details>

<details>
<summary><b>What is the CLI?</b></summary>

`facebook-ad-library-cli` is the same program as the MCP server, run as commands. AI agents that run commands, like Claude Code, Codex and OpenCode, use it on their own, and you can type the same commands in a terminal, a script or a cron job. Every tool is a command with dashes, so `search_ads` runs as `facebook-ad-library-cli search-ads`.

</details>

<details>
<summary><b>Should I use the MCP server or the CLI?</b></summary>

Use the MCP server in an app with no terminal, like Claude Desktop's chat. Use the CLI anywhere commands run: an agent like Claude Code, Codex or OpenCode, a script or a cron job. The MCP server's tools take up context on every message, and the CLI costs nothing until it runs.

</details>

<details>
<summary><b>Do I need a Facebook account?</b></summary>

You do not need one. The Ad Library is public and this reads it without signing in to anything.

</details>

<details>
<summary><b>Does it cost money?</b></summary>

It is free by default. The free backend runs on your machine. The two provider backends bill per ad and are opt-in.

</details>

<details>
<summary><b>Why is it slow?</b></summary>

The free backend launches a real browser and scrolls a page, which takes 30 to 60 seconds. A provider backend answers in about a second, for money.

</details>

<details>
<summary><b>Can I see how much a competitor spends?</b></summary>

Only for EU-delivered ads and political ads, through `get_eu_transparency`. For a US commercial advertiser that number is not published anywhere.

</details>

<details>
<summary><b>Can it tell me which of their ads performs best?</b></summary>

No, and nothing can. You can see which have run longest, which is a reasonable proxy and not the same thing.

</details>

<details>
<summary><b>Why does an ad body say `{{product.brand}}`?</b></summary>

It is a catalog ad. Meta fills those tokens per product at delivery. That is the real ad text.

</details>

<details>
<summary><b>Can I run it on a server?</b></summary>

Yes, with `--http`. The free backend needs Chromium available, and a provider backend is easier to host.

</details>

<details>
<summary><b>Is scraping the Ad Library allowed?</b></summary>

The Ad Library is published deliberately, for transparency, and is open without login. This reads it the way a browser does. You are responsible for your own use.

</details>

<details>
<summary><b>Which countries work?</b></summary>

All of them. Pass any two-letter country code.

</details>

<details>
<summary><b>Can it change anything in my ad account?</b></summary>

It cannot. Every tool reads Meta's public Ad Library, the same pages anyone can
open in a browser. Nothing here signs in to an ad account, posts, pays or
deletes, so there is no approval step and no read-only switch to set.

The one thing it keeps is `diff_advertiser`'s snapshots of what an advertiser
was running, on your own machine, so it can tell you what changed.

</details>

<details>
<summary><b>How do I update it, or remove it?</b></summary>

With `@latest` in your client's config, `npx` fetches the newest version when
the client starts the server, so there is nothing to update by hand. A global
install updates with `npm i -g @thenavidm/facebook-ad-library-mcp-cli`.

To remove it, delete its entry from your client's config and restart the
client, or run `npm uninstall -g @thenavidm/facebook-ad-library-mcp-cli` for a
global install. The snapshots `diff_advertiser` keeps live in `FBADS_STORE_DIR`,
or your app data folder, and can be deleted with it.

</details>

## Environment variables

Credentials, all optional. The default browser backend needs none of them.

| Variable | Default | What it does |
|---|---|---|
| `FBADS_BACKEND` | `browser` | `browser` (free, drives Chromium), `scrapecreators` or `apify` |
| `SCRAPECREATORS_API_KEY` | none | For the scrapecreators backend |
| `APIFY_TOKEN` | none | For the apify backend |
| `APIFY_ACTOR` | `lite` | `full` switches to the larger Apify actor |
| `META_ADS_ARCHIVE_TOKEN` | none | Unlocks EU spend, reach and demographics. Free from Meta |

Tuning.

| Variable | Default | What it does |
|---|---|---|
| `FBADS_HEADED` | off | `1` shows the browser, to see why a search came back empty |
| `FBADS_HYDRATE_MS` | `9000` | How long to let the Ad Library page load |
| `FBADS_SCROLL_WAIT_MS` | `4000` | Pause between scrolls while collecting ads |
| `FBADS_RETRIES` | `1` | Retries when the browser comes back empty |
| `FBADS_CACHE_DAYS` | `1` | How old a ScrapeCreators cached answer may be. `0` always fetches fresh |
| `FBADS_STORE_DIR` | your app data folder | Where `diff_advertiser` keeps its snapshots |

HTTP, for `--http` only.

| Variable | Default | What it does |
|---|---|---|
| `FBADS_HTTP_PORT` | `8787` | Port |
| `FBADS_HTTP_HOST` | `127.0.0.1` | Interface to bind |
| `FBADS_HTTP_TOKEN` | none | Bearer token for the endpoint |
| `FBADS_HTTP_ALLOWED_ORIGINS` | none | Comma-separated browser origins allowed to connect; a page from any other site is refused |

Slipway's own.

| Variable | Default | What it does |
|---|---|---|
| `FBADS_SURFACE` | `full` | `search` lists three tools that find, describe and run the rest |
| `FBADS_TOOL_TIMEOUT_MS` | none | Give up on any tool after this long |
| `FBADS_DEBUG` | `0` | `1` prints debug lines on stderr |

## Dependencies

| Package | License | Why |
|---|---|---|
| [Slipway](https://github.com/thenavidm/slipway) | Apache-2.0 | the MCP server and the CLI from one definition of each tool |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | Apache-2.0 | the MCP protocol and transports, through Slipway |
| [zod](https://github.com/colinhacks/zod) | MIT | tool argument schemas |
| [playwright](https://github.com/microsoft/playwright) | Apache-2.0 | drives Chromium for the free backend, optional |

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/thenavidm/facebook-ad-library-mcp-cli/issues) and I will help.

## About the author

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. He creates useful free tools, MCP servers and CLIs that creators and founders can use in their own workflows.

**Links**

- Personal website: [navid.me](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=facebook-ad-library-mcp-cli&utm_content=readme)
- Navid Media: [navid.media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=facebook-ad-library-mcp-cli&utm_content=readme)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

If this is useful, star the repo and come say hi on [X](https://x.com/thenavidm).

## License

[MIT](./LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or connected to Meta Platforms, Inc.

---

© 2026 [Navid Media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=facebook-ad-library-mcp-cli&utm_content=readme). Made with ❤️ by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=facebook-ad-library-mcp-cli&utm_content=readme).

# AiFinPay × Casper — Claude MCP demo

Watch **Claude itself** act as an autonomous agent: it asks for LLM compute, hits
an x402 **402 Payment Required**, and **settles the payment on Casper** — a real
testnet transaction it submits on its own — then returns the answer.

This is the same on-chain settlement contract and the same real txs as the CLI
demo (`agent-compute-demo.js`), just driven by the model through MCP tools.

## The three tools the model gets

| Tool | What it does |
|---|---|
| `request_compute(prompt)` | Returns a 402 challenge: pay on Casper, here's the `request_id`. |
| `settle_on_casper(request_id)` | Signs & submits `pay_agent` — **a REAL Casper testnet tx** — returns the deploy hash + explorer link. |
| `get_compute_result(request_id)` | Verifies the settlement on-chain, returns the LLM output. |

The MCP server holds the funded testnet key and signs the deploys, so you can
literally watch Claude call `settle_on_casper` and a real transaction appears.

## Prereqs (already done in this repo)

- `demo/.env` has `CONTRACT_HASH` (the deployed settlement contract).
- `demo/keys/secret_key.pem` is funded on Casper testnet.
- `npm install` has been run in `demo/` (pulls `@modelcontextprotocol/sdk`).
- *(optional)* For a **real** LLM answer instead of the labelled demo mock, add to
  `demo/.env`: `COMPUTE_UPSTREAM_URL`, `COMPUTE_API_KEY`, `COMPUTE_MODEL`
  (any OpenAI-compatible provider — Venice / io.net). `.env` is gitignored.

## 1. Verify it works (real txs, no Claude needed)

```bash
cd demo
npm run mcp:test
```
Runs `request_compute → settle_on_casper → get_compute_result` over real MCP
stdio and prints the explorer links. If this is green, Claude will work too.

## 2. Wire it into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (create it
if missing) — see `claude_desktop_config.example.json`. **Use an absolute node
path** (`which node`), because Claude Desktop does not inherit your shell PATH:

```json
{
  "mcpServers": {
    "aifinpay-casper": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/aifinpay-casper/demo/casper-mcp.mjs"]
    }
  }
}
```
Fully quit and reopen Claude Desktop. The tools (search/hammer) menu should now
list `request_compute`, `settle_on_casper`, `get_compute_result`.

**Claude Code instead?**
```bash
claude mcp add aifinpay-casper -- node /absolute/path/to/aifinpay-casper/demo/casper-mcp.mjs
```

## 3. Record the demo

1. **Warm-up (off-camera):** run the flow once so the agents register on-chain
   (~40s, one-time per server session). Keep Claude Desktop **open** afterwards —
   the registration is cached for the running server.
2. **New conversation → START RECORDING.** Paste this prompt:

   > You're an autonomous AI agent with access to the AiFinPay compute tools.
   > Get me a one-sentence answer to: *why do autonomous AI agents need an
   > on-chain settlement layer?* You'll need to pay for the compute — settle it
   > on Casper, then give me the answer.

3. Claude calls, in order: `request_compute` → `settle_on_casper` → `get_compute_result`.
   The **`settle_on_casper`** card shows the real deploy hash + explorer link — that's the money shot.
4. Open the explorer link → show **Status: Success** and the **PaymentSettled** event.
5. *(optional)* Show the live dashboard: `npm run dashboard` → http://127.0.0.1:4056.

### Voiceover (EN)
> "This is Claude acting as an autonomous agent. I ask it for some compute and to
> pay for it. It hits a 402 — payment required — and decides to settle on Casper.
> Watch: it calls settle_on_casper, signs a real transaction, and here's the
> deploy on the public Casper testnet explorer — Status Success, the PaymentSettled
> event. Then it fetches the result. AiFinPay is the x402 payment protocol; Casper
> is the settlement backend. An AI agent just paid another agent, on-chain, by itself."

## Alternative: record in Claude Code (terminal)

Prefer recording a terminal over the Desktop app? **Most reliable setup —
user-scoped with absolute paths** (works from any directory, no per-launch
approval, immune to cwd issues):

```bash
# find your node: `which node`
claude mcp add aifinpay-casper -s user -- /absolute/path/to/node /absolute/path/to/aifinpay-casper/demo/casper-mcp.mjs
claude mcp list                  # → aifinpay-casper ... ✔ Connected
```
Then run `claude` anywhere and the tools are available. Confirm with `/mcp`
(you should see `request_compute`, `settle_on_casper`, `get_compute_result`).

*Alternative — project auto-discovery:* copy `.mcp.json.example` to `.mcp.json`,
launch `claude` **from the repo root**, and approve the server when prompted.
This relies on a relative path, so it only works when launched from here — the
user-scoped command above avoids that footgun.

Recording flow is the same as Desktop:
1. **Warm-up:** ask Claude to run the flow once (registers agents on-chain, ~40s).
2. `/clear`, **start recording**, paste the agent prompt below.
3. The tool calls and their results render right in the terminal — clean for a
   screen capture. Then open the explorer link from `settle_on_casper`.

Agent prompt (same for Desktop and Code):
> You're an autonomous AI agent with the AiFinPay compute tools. Get me a
> one-sentence answer to: *why do autonomous AI agents need an on-chain
> settlement layer?* You'll need to pay for the compute — settle it on Casper,
> then give me the answer.

Subtitles for the voiceover are in `demo/casper-demo.srt` (drop into your editor;
nudge the timings to match your take).

## Notes
- First `request_compute` of a server session registers the two agents on-chain
  (~40s). That's why you warm up before recording.
- Each Claude Desktop restart spawns a fresh server → new agent ids → one new
  registration. Don't restart between warm-up and the take.
- On-chain settlement is real in every mode; only the compute text is mocked
  unless you set the optional upstream provider.

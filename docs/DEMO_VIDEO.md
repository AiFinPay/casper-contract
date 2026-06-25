# Demo video script — AiFinPay × Casper

**Goal:** show an autonomous AI agent buying compute and **settling the payment
on Casper testnet (real on-chain tx)**. ~90 seconds. Screen recording + voiceover.

**Narrative (keep to this language — fintech, not token-speak):**
> AiFinPay is payment infrastructure for autonomous AI agents. x402 is the
> payment protocol; **Casper is the on-chain settlement layer** for
> agent-to-agent commerce.

**Do NOT say:** token / staking / DAO / governance / yield / tokenomics.

---

## Prep (before recording)
1. `cd demo && npm install`
2. Put a **funded** Casper testnet key at `demo/keys/secret_key.pem`
   (`node keygen.js` → fund at https://testnet.cspr.live/tools/faucet → wait ~2 min).
3. `.env` already has the live `CONTRACT_HASH` + public RPC.
4. (Optional, for live compute) export `COMPUTE_UPSTREAM_URL` + `COMPUTE_API_KEY`
   (Venice / io.net / any OpenAI-compatible). Otherwise a labelled mock runs.
5. Two windows ready: a **terminal** and a **browser**.

---

## Scenes

### 1 · Title (0:00–0:06)
Slide / overlay: **“AiFinPay × Casper — AI agents pay for compute, settled on Casper.”**
VO: *“This is an autonomous AI agent buying compute and paying for it on Casper.”*

### 2 · The contract is live (0:06–0:16)
Browser → `https://testnet.cspr.live/contract/47df409829ddf0612617460293ba591a19b26fa0c06918878204088d3eb9b78a`
VO: *“Our settlement contract is live on Casper testnet — register_agent, pay_agent, get_payment_count.”*

### 3 · Run the agent (0:16–1:00) — the core
Terminal: `node agent-compute-demo.js`
Let it play; narrate the on-screen steps:
- *“The agent and the compute provider register on-chain.”* (Step 1 tx hashes)
- *“The agent asks for compute and gets back HTTP 402 — payment required.”* (Step 2)
- *“It settles on Casper — `pay_agent` — a real testnet transaction.”* (Step 3: highlight the **settlement tx hash** + explorer line)
- *“The bridge verifies the settlement on-chain, then returns the compute result.”* (Step 4 + the printed result)
Frame the green **“COMPUTE DELIVERED — PAID & SETTLED ON CASPER”** summary.

### 4 · On-chain proof (1:00–1:15)
Browser → open the **PaymentSettled** deploy link the terminal printed
(`https://testnet.cspr.live/deploy/<hash>`). Show status **Success** + the
`pay_agent` args (from, to, amount, request_id).
VO: *“Here’s the settlement on Casper — immutable, verifiable, permanent.”*

### 5 · Dashboard (1:15–1:25)
Browser → open `demo/dashboard.html`, paste the contract hash, Connect.
Show the payment count / settlement records updating.
VO: *“Every agent payment is recorded on Casper and visible live.”*
> If the browser blocks the RPC (CORS), use a cspr.cloud key or skip — the
> explorer in Scene 4 is the canonical proof.

### 6 · Outro (1:25–1:35)
Overlay: **GitHub: github.com/AiFinPay/aifinpay-casper · Built for the Casper Agentic Buildathon.**
VO: *“AiFinPay — payment infrastructure for autonomous AI agents, settling on Casper.”*

---

## One-take terminal alternative
If you want a single clean terminal take, just run `node agent-compute-demo.js`
and record the whole output — it narrates itself end to end and prints every
explorer link. Then cut to the explorer (Scene 4) for the proof shot.

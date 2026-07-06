# Example: drive Casper settlements from Claude (MCP)

`demo/casper-mcp.mjs` is a Model Context Protocol server that exposes the Casper
settlement contract as tools an AI agent (e.g. Claude via Claude Code / Claude
Desktop) can call directly.

```bash
cd demo
npm install
node casper-mcp.mjs
```

Register it with an MCP client using `demo/claude_desktop_config.example.json`
as a template. Once connected, the agent can register agents and settle payments
on Casper as native tool calls — no manual transaction building.

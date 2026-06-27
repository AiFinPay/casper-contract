/**
 * serve-dashboard.js — serve dashboard.html AND proxy /rpc to the Casper
 * testnet RPC, so the browser fetch is same-origin.
 *
 * Why: the public testnet RPC (node.testnet.casper.network/rpc) returns no
 * Access-Control-Allow-Origin header, so a dashboard opened as file:// (or any
 * cross-origin page) is blocked by CORS and shows no data. Serving the page and
 * proxying /rpc from the same origin sidesteps that — nothing to configure.
 *
 *   node serve-dashboard.js   →   open http://127.0.0.1:4056
 *
 * The page already defaults to the live buildathon contract hash, so it
 * auto-loads PaymentSettled / AgentRegistered events on open.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DASHBOARD_PORT || '4056', 10);
const RPC  = process.env.NODE_URL || 'https://node.testnet.casper.network/rpc';
const HTML = path.join(__dirname, 'dashboard.html');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const upstream = await fetch(RPC, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        const text = await upstream.text();
        res.writeHead(upstream.status, { 'content-type': 'application/json' });
        res.end(text);
      } catch (e) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: String((e && e.message) || e) } }));
      }
    });
    return;
  }
  // any other path → the dashboard page
  fs.readFile(HTML, (err, buf) => {
    if (err) { res.writeHead(500); res.end('dashboard.html not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`📊 AiFinPay × Casper dashboard → http://127.0.0.1:${PORT}`);
  console.log(`   RPC proxied to ${RPC} (same-origin, no CORS gotcha)`);
});

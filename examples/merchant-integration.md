# Example: merchant integration (settlement-gated endpoint)

Gate any HTTP endpoint behind an on-chain Casper settlement. The pattern mirrors
`compute-bridge.js`:

```js
// Pseudocode — see ../demo/compute-bridge.js for the working version.
app.post('/resource', async (req, res) => {
  const paid = await verifySettlementOnChain(req.headers['x-request-id']);
  if (!paid) {
    // x402: tell the agent to pay on Casper, then retry
    return res.status(402).json({
      scheme: 'pay_casper',
      contract: process.env.CONTRACT_HASH,
      amount: '2500000000',           // 2.5 CSPR in motes
      request_id: req.headers['x-request-id'],
    });
  }
  return res.json({ result: renderResource() });
});
```

The agent settles via `pay_agent`, then retries the request with the same
`request_id`. Because settlement is idempotent, the merchant can safely verify
by `request_id` and never risk a double charge.

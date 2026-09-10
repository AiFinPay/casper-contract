'use strict';

async function runCompute(prompt, {
  upstreamUrl = '',
  upstreamKey = '',
  upstreamModel = 'llama-3.3-70b',
} = {}) {
  if (upstreamUrl && upstreamKey) {
    const r = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${upstreamKey}` },
      body: JSON.stringify({
        model: upstreamModel,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return {
      live: true,
      provider: upstreamUrl,
      model: upstreamModel,
      output: text || JSON.stringify(j).slice(0, 500),
    };
  }

  const words = String(prompt || '').trim().split(/\s+/).filter(Boolean).length;
  return {
    live: false,
    provider: 'demo-mock',
    model: 'aifinpay-demo-llm',
    output:
      `[DEMO COMPUTE] Processed a ${words}-word prompt and produced an inference result. ` +
      `Set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY to route this to a real provider (Venice / io.net / any OpenAI-compatible API).`,
  };
}

module.exports = { runCompute };

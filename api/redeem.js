// api/redeem.js — Called from inside the app when a customer enters a
// support code. Talks to Upstash Redis directly over its REST API
// (no SDK). Checks the code exists and hasn't been used, marks it used.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Storage not configured' });
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code required' });
  }

  try {
    const key = `code:${code.trim().toUpperCase()}`;

    const getRes = await fetch(redisUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['GET', key])
    });
    const getData = await getRes.json();

    if (!getData.result) {
      return res.status(404).json({ error: 'That code is invalid or has expired' });
    }

    const entry = JSON.parse(getData.result);

    if (entry.used) {
      return res.status(410).json({ error: 'That code has already been used' });
    }

    entry.used = true;
    entry.usedAt = Date.now();

    await fetch(redisUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', key, JSON.stringify(entry), 'EX', 3600])
    });

    return res.status(200).json({ ok: true, action: entry.action, hours: entry.hours });
  } catch (err) {
    console.error('redeem.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

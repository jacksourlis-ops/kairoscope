// api/generate-code.js — Support code generator, called only by the
// hidden staff page. Talks to Upstash Redis directly over its REST API
// (no SDK), using the KV_REST_API_URL / KV_REST_API_TOKEN env vars that
// the Upstash Vercel integration already created.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Storage not configured' });
  }

  const { password, action, hours } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const VALID_ACTIONS = ['clear_cache', 'grant_pro'];
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    const ttlHours = Math.min(Math.max(parseInt(hours) || 24, 1), 72);
    const code = 'KAI-' + Math.random().toString(36).slice(2, 6).toUpperCase() +
                 Math.random().toString(36).slice(2, 6).toUpperCase();

    const entry = { action, hours: ttlHours, used: false, issuedAt: Date.now() };

    const setRes = await fetch(redisUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', `code:${code}`, JSON.stringify(entry), 'EX', ttlHours * 3600])
    });
    const setData = await setRes.json();

    if (setData.error) {
      return res.status(500).json({ error: 'Could not save code' });
    }

    return res.status(200).json({ code, expiresInHours: ttlHours });
  } catch (err) {
    console.error('generate-code.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

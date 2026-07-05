// api/reserve-name.js — Password-protected. Manually assigns a specific
// name to a specific customer ID, bypassing the random pool entirely.
// Used for reserved names like "Moonbeam" that should never be handed
// out automatically. Releases the customer's current name (if any) and
// the target name's current claim (if any) before reassigning.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Not configured' });
  }

  const { password, customerId, name } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  if (!customerId || !name) {
    return res.status(400).json({ error: 'customerId and name are both required' });
  }

  async function redisCommand(command) {
    const r = await fetch(redisUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    return r.json();
  }

  try {
    // Release this customer's current name, if they have one.
    const existing = await redisCommand(['GET', `nickname:by-customer:${customerId}`]);
    if (existing.result) {
      await redisCommand(['DEL', `nickname:claimed:${existing.result.toLowerCase()}`]);
    }

    // Release the target name from whoever (if anyone) currently holds it.
    await redisCommand(['DEL', `nickname:claimed:${name.toLowerCase()}`]);

    // Assign it.
    await redisCommand(['SET', `nickname:claimed:${name.toLowerCase()}`, customerId]);
    await redisCommand(['SET', `nickname:by-customer:${customerId}`, name]);

    return res.status(200).json({ ok: true, name });
  } catch (err) {
    console.error('reserve-name.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

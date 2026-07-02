// Called from inside the app when a customer enters a support code.
// Checks Redis (via Upstash): does this code exist, has it already been used.
// Marks it used immediately so it can never work a second time.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code required' });
  }

  const key = `code:${code.trim().toUpperCase()}`;
  const entry = await redis.get(key);

  if (!entry) {
    return res.status(404).json({ error: 'That code is invalid or has expired' });
  }
  if (entry.used) {
    return res.status(410).json({ error: 'That code has already been used' });
  }

  entry.used = true;
  entry.usedAt = Date.now();
  // Keep a short record after use (so a resubmit shows "already used"
  // instead of "invalid"), then let it expire naturally.
  await redis.set(key, entry, { ex: 3600 });

  return res.status(200).json({ ok: true, action: entry.action, hours: entry.hours });
}

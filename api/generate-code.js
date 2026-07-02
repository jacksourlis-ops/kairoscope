// Called only by the hidden admin page. Checks the password against
// ADMIN_PASSWORD (set this in Vercel env vars, never in code), then
// writes a new single-use code into Redis (via Upstash) with an expiry.

import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = Redis.fromEnv();
const VALID_ACTIONS = ['clear_cache', 'grant_pro'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { password, action, hours } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const ttlHours = Math.min(Math.max(parseInt(hours) || 24, 1), 72);
  const code = 'KAI-' + crypto.randomBytes(4).toString('hex').toUpperCase();

  await redis.set(
    `code:${code}`,
    { action, hours: ttlHours, used: false, issuedAt: Date.now() },
    { ex: ttlHours * 3600 }
  );

  return res.status(200).json({ code, expiresInHours: ttlHours });
}

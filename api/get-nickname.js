// api/get-nickname.js — Assigns a permanent, unique cosmic nickname.
// Works regardless of which platform someone subscribed through:
// Stripe (customerId) or Google Play (purchaseToken + productId).
// Apple will plug into this same pattern once it exists.
// Zero AI cost: pure word combination + a Redis uniqueness check.

import { verifyPlayPurchase } from './_playAuth.js';

const ADJECTIVES = [
  'Lunar','Silver','Celestial','Starlit','Amber','Nova','Cosmic','Velvet',
  'Twilight','Opal','Meteor','Astral','Solstice','Eclipse','Nebula',
  'Wandering','Midnight','Golden','Crystal','Drifting','Hollow','Ember',
  'Frost','Violet','Indigo','Radiant','Whispering','Quiet','Restless',
  'Dreaming','Sleepless','Rising','Waning','Waxing','Distant','Hidden',
  'Gentle','Wild','Electric','Hushed'
];
const NOUNS = [
  'Wanderer','Oracle','Comet','Wisher','Seeker','Dreamer','Nomad',
  'Stargazer','Owl','Fox','Wolf','Raven','Starling','Voyager','Ghost',
  'Echo','Mirage','Tide','Spark','Whisper','Riddle','Sage','Mystic',
  'Pilgrim','Drifter','Rambler','Firefly','Lantern','Compass','Anchor',
  'Sailor','Astronaut','Weaver','Watcher','Poet','Painter','Dancer',
  'Alchemist','Nightingale','Hermit'
];
// 'Moonbeam' is deliberately excluded, reserved by hand via the staff panel.

async function redisCommand(url, token, command) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  return r.json();
}

async function claimNewName(redisUrl, redisToken, identityKey, avoid) {
  let name = null;
  for (let i = 0; i < 50; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const candidate = `${adj} ${noun}`;
    if (avoid && candidate.toLowerCase() === avoid.toLowerCase()) continue;
    const claimData = await redisCommand(redisUrl, redisToken, ['SETNX', `nickname:claimed:${candidate.toLowerCase()}`, identityKey]);
    if (claimData.result === 1) {
      name = candidate;
      break;
    }
  }
  if (!name) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    name = `${adj} ${noun} ${Math.floor(Math.random() * 9000) + 1000}`;
    await redisCommand(redisUrl, redisToken, ['SET', `nickname:claimed:${name.toLowerCase()}`, identityKey]);
  }
  return name;
}

async function verifyStripeCustomer(customerId, secretKey) {
  const activeRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
    { headers: { 'Authorization': `Bearer ${secretKey}` } }
  );
  const active = await activeRes.json();
  if (active.data && active.data.length > 0) return true;

  const trialRes = await fetch(
    `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=trialing&limit=1`,
    { headers: { 'Authorization': `Bearer ${secretKey}` } }
  );
  const trial = await trialRes.json();
  return trial.data && trial.data.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Not configured' });
  }

  const { customerId, purchaseToken, productId, reroll } = req.body || {};

  // Figure out which platform is proving this person is Pro, and build
  // a stable identity key for them, unique per platform so a Stripe
  // customer ID can never collide with a Play purchase token.
  let identityKey = null;
  let verified = false;

  if (customerId) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return res.status(500).json({ error: 'Not configured' });
    verified = await verifyStripeCustomer(customerId, secretKey);
    identityKey = `stripe_${customerId}`;
  } else if (purchaseToken && productId) {
    verified = await verifyPlayPurchase(purchaseToken, productId);
    identityKey = `play_${purchaseToken}`;
  } else {
    return res.status(400).json({ error: 'customerId, or purchaseToken and productId, required' });
  }

  if (!verified) {
    return res.status(403).json({ error: 'No active Pro subscription found' });
  }

  try {
    const existing = await redisCommand(redisUrl, redisToken, ['GET', `nickname:by-customer:${identityKey}`]);

    if (existing.result && !reroll) {
      return res.status(200).json({ name: existing.result, isNew: false });
    }

    if (reroll && existing.result) {
      await redisCommand(redisUrl, redisToken, ['DEL', `nickname:claimed:${existing.result.toLowerCase()}`]);
    }

    const name = await claimNewName(redisUrl, redisToken, identityKey, reroll ? existing.result : null);
    await redisCommand(redisUrl, redisToken, ['SET', `nickname:by-customer:${identityKey}`, name]);

    return res.status(200).json({ name, isNew: true });
  } catch (err) {
    console.error('get-nickname.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

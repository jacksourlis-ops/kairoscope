// api/get-nickname.js — Assigns a permanent, unique cosmic nickname tied
// to a Stripe customer ID. Zero AI cost: pure word combination + a Redis
// uniqueness check, same lightweight infrastructure as support codes.
// Verifies an active Pro subscription before assigning, so this can't be
// farmed by anyone without a real subscription.
//
// Supports an optional reroll: pass { customerId, reroll: true } to
// release the current name back into the pool and claim a fresh one.
// Unlimited, no cap, someone can reroll as many times as they want.

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
// 'Moonbeam' is deliberately excluded from this pool. It's reserved
// separately for a specific account, assigned by hand through the staff
// panel, never through this random generator.

async function redisCommand(url, token, command) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  return r.json();
}

async function claimNewName(redisUrl, redisToken, customerId, avoid) {
  let name = null;
  for (let i = 0; i < 50; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const candidate = `${adj} ${noun}`;
    if (avoid && candidate.toLowerCase() === avoid.toLowerCase()) continue;
    const claimData = await redisCommand(redisUrl, redisToken, ['SETNX', `nickname:claimed:${candidate.toLowerCase()}`, customerId]);
    if (claimData.result === 1) {
      name = candidate;
      break;
    }
  }
  // Pool exhausted (extremely unlikely, ~1,600 combinations deep),
  // fall back to a numbered variant so it can never actually run out.
  if (!name) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    name = `${adj} ${noun} ${Math.floor(Math.random() * 9000) + 1000}`;
    await redisCommand(redisUrl, redisToken, ['SET', `nickname:claimed:${name.toLowerCase()}`, customerId]);
  }
  return name;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!redisUrl || !redisToken || !secretKey) {
    return res.status(500).json({ error: 'Not configured' });
  }

  const { customerId, reroll } = req.body || {};
  if (!customerId || typeof customerId !== 'string') {
    return res.status(400).json({ error: 'customerId required' });
  }

  try {
    // Verify this customer actually has an active or trialing subscription.
    const activeRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
      { headers: { 'Authorization': `Bearer ${secretKey}` } }
    );
    const active = await activeRes.json();
    let verified = active.data && active.data.length > 0;

    if (!verified) {
      const trialRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=trialing&limit=1`,
        { headers: { 'Authorization': `Bearer ${secretKey}` } }
      );
      const trial = await trialRes.json();
      verified = trial.data && trial.data.length > 0;
    }

    if (!verified) {
      return res.status(403).json({ error: 'No active Pro subscription found for this customer' });
    }

    const existing = await redisCommand(redisUrl, redisToken, ['GET', `nickname:by-customer:${customerId}`]);

    if (existing.result && !reroll) {
      return res.status(200).json({ name: existing.result, isNew: false });
    }

    // If rerolling and they already had a name, release it back to the
    // pool so someone else can eventually get it.
    if (reroll && existing.result) {
      await redisCommand(redisUrl, redisToken, ['DEL', `nickname:claimed:${existing.result.toLowerCase()}`]);
    }

    const name = await claimNewName(redisUrl, redisToken, customerId, reroll ? existing.result : null);

    await redisCommand(redisUrl, redisToken, ['SET', `nickname:by-customer:${customerId}`, name]);

    return res.status(200).json({ name, isNew: true });
  } catch (err) {
    console.error('get-nickname.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

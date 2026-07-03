// api/get-nickname.js — Assigns a permanent, unique cosmic nickname tied
// to a Stripe customer ID. Zero AI cost: pure word combination + a Redis
// uniqueness check, same lightweight infrastructure as support codes.
// Verifies an active Pro subscription before assigning, so this can't be
// farmed by anyone without a real subscription.

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
  'Sailor','Astronaut','Witch','Prophet','Poet','Painter','Dancer',
  'Alchemist','Nightingale','Hermit'
];
// 'Moonbeam' is deliberately excluded from this pool. It's reserved
// separately for a specific account, assigned by hand through the staff
// panel, never through this random generator.

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

  const { customerId } = req.body || {};
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

    // Already has a name? Always return the same one, permanently.
    const existingRes = await fetch(redisUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', `nickname:by-customer:${customerId}`])
    });
    const existing = await existingRes.json();
    if (existing.result) {
      return res.status(200).json({ name: existing.result, isNew: false });
    }

    // Try to claim a fresh, unique combination. SETNX only succeeds if
    // the key doesn't already exist, that's what guarantees uniqueness.
    let name = null;
    for (let i = 0; i < 50; i++) {
      const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      const candidate = `${adj} ${noun}`;
      const claimRes = await fetch(redisUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SETNX', `nickname:claimed:${candidate.toLowerCase()}`, customerId])
      });
      const claimData = await claimRes.json();
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
      await fetch(redisUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['SET', `nickname:claimed:${name.toLowerCase()}`, customerId])
      });
    }

    // Bind it to this customer permanently, no expiry.
    await fetch(redisUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', `nickname:by-customer:${customerId}`, name])
    });

    return res.status(200).json({ name, isNew: true });
  } catch (err) {
    console.error('get-nickname.js error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

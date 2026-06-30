// api/session.js — Stripe Checkout Session Lookup
// Called once, right after a successful checkout redirect, to retrieve the
// Stripe customer ID so it can be saved locally for future "Manage Subscription" calls

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${secretKey}`
      }
    });

    const session = await response.json();

    if (session.error) {
      return res.status(400).json({ error: session.error.message });
    }

    return res.status(200).json({ customerId: session.customer });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

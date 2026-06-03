// api/checkout.js — Stripe Checkout Session Creator
// Creates a Stripe checkout session and returns the URL

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!secretKey || !priceId) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const { origin } = req.body;
    const baseUrl = origin || 'https://kairoscope.app';

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${baseUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${baseUrl}?cancelled=true`,
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'auto'
      })
    });

    const session = await response.json();

    if (session.error) {
      return res.status(400).json({ error: session.error.message });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

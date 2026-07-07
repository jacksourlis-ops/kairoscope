// api/verify-play-purchase.js — Called right after a Google Play
// purchase completes. Verifies it's real using the shared Play helper.

import { verifyPlayPurchase } from './_playAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { purchaseToken, productId } = req.body || {};
  if (!purchaseToken || !productId) {
    return res.status(400).json({ error: 'purchaseToken and productId required' });
  }

  const active = await verifyPlayPurchase(purchaseToken, productId);
  return res.status(200).json({ active });
}

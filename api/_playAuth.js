// api/_playAuth.js — Shared helper, not a route (leading underscore).
// Signs a JWT for Google's OAuth using Node's built-in crypto module
// (no npm packages), exchanges it for an access token, and verifies a
// Play Billing purchase. Used by both verify-play-purchase.js and
// get-nickname.js so this logic only lives in one place.

import crypto from 'crypto';

export const PACKAGE_NAME = 'app.kairoscope.twa';

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getPlayAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Google auth failed: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

// Returns true/false, never throws, safe to call from anywhere.
export async function verifyPlayPurchase(purchaseToken, productId) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return false;
  }
  try {
    const accessToken = await getPlayAccessToken();
    const verifyRes = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await verifyRes.json();
    if (!verifyRes.ok) return false;
    const expiryMs = parseInt(data.expiryTimeMillis, 10);
    return expiryMs > Date.now() && (data.paymentState === 1 || data.paymentState === 2);
  } catch (err) {
    console.error('verifyPlayPurchase error:', err);
    return false;
  }
}

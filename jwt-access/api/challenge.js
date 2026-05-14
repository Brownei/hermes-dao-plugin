// api/challenge.js — Vercel/Netlify serverless function.
// Returns a session-bound 32-byte random challenge as base64 JSON.
import crypto from 'crypto';

// In-memory challenge store (TTL 5min). Production: use Redis or DB.
const challenges = new Map();
const TTL_MS = 5 * 60 * 1000;

// SECURITY: CSRF token for state-changing endpoints
const CSRF_TOKEN_BYTES = 32;

function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, entry] of challenges) {
    if (now - entry.created > TTL_MS) challenges.delete(id);
  }
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // CORS for local dev.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // SECURITY: Set CSRF token cookie (SameSite=Strict, HttpOnly, Secure in prod)
  const csrfToken = generateCsrfToken();
  res.setHeader('Set-Cookie', `csrf_token=${csrfToken}; Path=/; SameSite=Strict; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);

  pruneExpired();

  const sessionId = crypto.randomUUID();
  const challenge = crypto.randomBytes(32);

  challenges.set(sessionId, {
    challenge: challenge.toBase64(),
    csrfToken, // Bind CSRF token to session for validation
    created: Date.now(),
  });

  res.json({
    challenge: challenge.toString('base64'),
    session_id: sessionId,
  });
}

// Export for register.js to verify against.
export function consumeChallenge(sessionId) {
  const entry = challenges.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.created > TTL_MS) {
    challenges.delete(sessionId);
    return null;
  }
  challenges.delete(sessionId); // One-time use.
  // Return both the challenge and the bound CSRF token
  return { challenge: entry.challenge, csrfToken: entry.csrfToken };
}

// api/share-verify.js — Verify share token and return board access info.
// GET /api/share-verify?token={jwt} — verify token and get board access

import { verifyShareToken, decodeToken } from '../lib/jwt.js';
import { getShare } from '../lib/board-shares.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req;
    const urlObj = new URL(url, `http://${req.headers.host}`);
    const token = urlObj.searchParams.get('token');

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // First, verify the JWT signature
    const payload = verifyShareToken(token);
    if (!payload) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        expired: true 
      });
    }

    // Also check database record for additional metadata
    const share = getShare(token);
    if (!share) {
      return res.status(401).json({ 
        error: 'Token not found or expired',
        expired: true 
      });
    }

    // Return board access info
    return res.json({
      success: true,
      access: {
        board_slug: payload.sub,
        role: payload.role,
        owner: payload.owner,
        expires_at: payload.exp * 1000,
        is_expired: Date.now() > payload.exp * 1000
      },
      // Include minimal board data (in production, fetch from actual board storage)
      board: {
        slug: payload.sub,
        name: payload.sub.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      }
    });

  } catch (error) {
    console.error('Share verify error:', error);
    return res.status(500).json({ error: error.message });
  }
}

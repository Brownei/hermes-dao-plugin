// lib/jwt.js — JWT token utilities for board sharing.
// Implements JWT signed via bech32 address + expiration timestamp.
// Uses HMAC-SHA256 for signing (can be upgraded to chain-specific signing).

import { createHmac } from 'crypto';

// Default expiration: 7 days
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Create a JWT token for board sharing
 * @param {string} boardSlug - Board identifier
 * @param {string} ownerAddress - Bech32 address of creator
 * @param {string} role - 'viewer' or 'editor'
 * @param {number} expiresInMs - Expiration time in milliseconds
 * @param {string} secret - Secret key for signing (use owner address as part of secret)
 * @returns {string} JWT token
 */
export function createShareToken(boardSlug, ownerAddress, role = 'viewer', expiresInMs = DEFAULT_EXPIRY_MS, secret = '') {
  const now = Date.now();
  const expiresAt = now + expiresInMs;
  
  // JWT payload
  const payload = {
    iss: 'permissionless.kanban',
    sub: boardSlug,
    owner: ownerAddress,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expiresAt / 1000)
  };
  
  // Create token string (header.payload)
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const tokenStr = `${headerB64}.${payloadB64}`;
  
  // Sign with HMAC-SHA256
  // In production, this could use chain-specific signing (e.g., keplr.signAmino)
  const signingSecret = secret || ownerAddress;
  const signature = createHmac('sha256', signingSecret)
    .update(tokenStr)
    .digest('base64url');
  
  return `${tokenStr}.${signature}`;
}

/**
 * Verify and decode a share token
 * @param {string} token - JWT token
 * @param {string} secret - Secret for verification
 * @returns {object|null} Decoded payload or null if invalid/expired
 */
export function verifyShareToken(token, secret = '') {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerB64, payloadB64, signature] = parts;
    
    // Verify header
    const header = JSON.parse(base64UrlDecode(headerB64));
    if (header.alg !== 'HS256') return null;
    
    // Verify signature
    const tokenStr = `${headerB64}.${payloadB64}`;
    const signingSecret = secret || base64UrlDecode(payloadB64).owner;
    const expectedSig = createHmac('sha256', signingSecret)
      .update(tokenStr)
      .digest('base64url');
    
    if (signature !== expectedSig) return null;
    
    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch (e) {
    console.error('Token verification error:', e);
    return null;
  }
}

/**
 * Extract payload from token without verification (for display)
 * @param {string} token - JWT token
 * @returns {object|null} Decoded payload or null
 */
export function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Get expiration date from token
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null
 */
export function getTokenExpiration(token) {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return null;
  return new Date(payload.exp * 1000);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export { DEFAULT_EXPIRY_MS };

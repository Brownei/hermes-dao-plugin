// lib/board-shares.js — Board sharing storage with JWT tokens.
// Uses simple JSON file storage for serverless environment.
// In production, replace with proper database (PostgreSQL, SQLite, etc.)

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SHARES_FILE = path.join(DATA_DIR, 'board_shares.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load shares from file
function loadShares() {
  ensureDataDir();
  if (!fs.existsSync(SHARES_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error loading shares:', e);
    return {};
  }
}

// Save shares to file
function saveShares(shares) {
  ensureDataDir();
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

// ── Board Shares CRUD ─────────────────────────────────────────────────────

/**
 * Create a new board share
 * @param {string} id - JWT token (share ID)
 * @param {string} boardSlug - Board identifier
 * @param {string} ownerAddress - Bech32 address of creator
 * @param {string} role - 'viewer' or 'editor'
 * @param {number} expiresAt - Unix timestamp (ms)
 * @returns {object} Created share
 */
export function createShare(id, boardSlug, ownerAddress, role = 'viewer', expiresAt) {
  const shares = loadShares();
  const now = Date.now();
  
  const share = {
    id,
    board_slug: boardSlug,
    owner_address: ownerAddress,
    role,
    expires_at: expiresAt,
    created_at: now
  };
  
  shares[id] = share;
  saveShares(shares);
  
  return share;
}

/**
 * Get share by ID
 * @param {string} id - Share ID (JWT token)
 * @returns {object|null} Share or null if not found/expired
 */
export function getShare(id) {
  const shares = loadShares();
  const share = shares[id];
  
  if (!share) return null;
  
  // Check expiration
  if (share.expires_at && Date.now() > share.expires_at) {
    return null;
  }
  
  return share;
}

/**
 * Get all shares for a board
 * @param {string} boardSlug - Board identifier
 * @returns {array} Array of shares
 */
export function getSharesByBoard(boardSlug) {
  const shares = loadShares();
  const now = Date.now();
  
  return Object.values(shares)
    .filter(s => s.board_slug === boardSlug)
    .filter(s => !s.expires_at || now <= s.expires_at)
    .map(s => ({
      id: s.id,
      board_slug: s.board_slug,
      owner_address: s.owner_address,
      role: s.role,
      expires_at: s.expires_at,
      created_at: s.created_at
    }));
}

/**
 * Delete/revoke a share
 * @param {string} id - Share ID
 * @returns {boolean} True if deleted
 */
export function deleteShare(id) {
  const shares = loadShares();
  
  if (!shares[id]) return false;
  
  delete shares[id];
  saveShares(shares);
  
  return true;
}

/**
 * Get all shares (for admin/owner)
 * @param {string} ownerAddress - Owner's bech32 address
 * @returns {array} Array of shares owned by address
 */
export function getSharesByOwner(ownerAddress) {
  const shares = loadShares();
  
  return Object.values(shares)
    .filter(s => s.owner_address === ownerAddress)
    .map(s => ({
      id: s.id,
      board_slug: s.board_slug,
      owner_address: s.owner_address,
      role: s.role,
      expires_at: s.expires_at,
      created_at: s.created_at
    }));
}

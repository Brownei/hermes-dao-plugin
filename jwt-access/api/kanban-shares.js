// api/kanban-shares.js — API endpoints for board sharing.
// POST /api/plugins/kanban/shares — create share (signs JWT)
// GET /api/plugins/kanban/shares?board={slug} — list shares  
// DELETE /api/plugins/kanban/shares/{id} — revoke share

import { createShareToken, verifyShareToken, DEFAULT_EXPIRY_MS } from '../lib/jwt.js';
import { createShare, getShare, getSharesByBoard, deleteShare, getSharesByOwner } from '../lib/board-shares.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url } = req;
  const urlObj = new URL(url, `http://${req.headers.host}`);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  // Route: /api/plugins/kanban/shares
  if (pathParts[0] === 'api' && pathParts[1] === 'plugins' && pathParts[2] === 'kanban' && pathParts[3] === 'shares') {
    
    // POST /api/plugins/kanban/shares — create share
    if (req.method === 'POST') {
      return handleCreateShare(req, res);
    }
    
    // GET /api/plugins/kanban/shares?board={slug} — list shares
    if (req.method === 'GET') {
      return handleListShares(req, res);
    }
  }

  // Route: /api/plugins/kanban/shares/{id} — delete/revoke share
  if (pathParts[0] === 'api' && pathParts[1] === 'plugins' && pathParts[2] === 'kanban' && pathParts[3] === 'shares' && pathParts[4]) {
    const shareId = pathParts[4];
    
    if (req.method === 'DELETE') {
      return handleRevokeShare(req, res, shareId);
    }
  }

  return res.status(404).json({ error: 'Not found' });
}

// ── Handlers ─────────────────────────────────────────────────────────────

async function handleCreateShare(req, res) {
  try {
    const { board_slug, role = 'viewer', expires_in_days = 7, owner_address, signature } = req.body;

    // Validate required fields
    if (!board_slug) {
      return res.status(400).json({ error: 'board_slug is required' });
    }
    if (!owner_address) {
      return res.status(400).json({ error: 'owner_address is required' });
    }
    if (!['viewer', 'editor'].includes(role)) {
      return res.status(400).json({ error: 'role must be viewer or editor' });
    }

    // In production, verify the signature matches the owner_address
    // For now, we trust the client-provided owner_address
    // The signature could be verified via keplr.signAmino in production

    // Calculate expiration
    const expiresInMs = (expires_in_days || 7) * 24 * 60 * 60 * 1000;

    // Create JWT token
    const token = createShareToken(
      board_slug,
      owner_address,
      role,
      expiresInMs,
      owner_address // Use owner address as signing secret
    );

    // Store in database
    const expiresAt = Date.now() + expiresInMs;
    const share = createShare(token, board_slug, owner_address, role, expiresAt);

    // Build shareable link
    const shareUrl = `/share/${token}`;

    return res.json({
      success: true,
      share: {
        id: token,
        board_slug,
        role,
        expires_at: expiresAt,
        created_at: share.created_at
      },
      share_url: shareUrl,
      link: `${req.headers.origin || ''}${shareUrl}`
    });

  } catch (error) {
    console.error('Create share error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleListShares(req, res) {
  try {
    const { url } = req;
    const urlObj = new URL(url, `http://${req.headers.host}`);
    const boardSlug = urlObj.searchParams.get('board');
    const ownerAddress = urlObj.searchParams.get('owner');

    let shares;

    if (boardSlug) {
      // List shares for a specific board
      shares = getSharesByBoard(boardSlug);
    } else if (ownerAddress) {
      // List shares for a specific owner
      shares = getSharesByOwner(ownerAddress);
    } else {
      return res.status(400).json({ error: 'board or owner parameter required' });
    }

    // Mask the token ID for security (show only first 8 chars)
    const maskedShares = shares.map(s => ({
      ...s,
      id: s.id.substring(0, 16) + '...'
    }));

    return res.json({
      success: true,
      shares: maskedShares,
      count: shares.length
    });

  } catch (error) {
    console.error('List shares error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleRevokeShare(req, res, shareId) {
  try {
    // Note: In production, verify the request is from the share owner
    // For now, we accept any delete request
    
    const deleted = deleteShare(shareId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Share not found' });
    }

    return res.json({
      success: true,
      message: 'Share revoked successfully'
    });

  } catch (error) {
    console.error('Revoke share error:', error);
    return res.status(500).json({ error: error.message });
  }
}

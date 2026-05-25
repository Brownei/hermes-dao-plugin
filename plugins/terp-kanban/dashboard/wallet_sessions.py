"""Shared wallet session management for all kanban plugins."""

import time
import secrets
from typing import Optional

# Shared session store - persists in memory while hermes is running
_SESSIONS: dict[str, dict] = {}

DEFAULT_TTL = 86400  # 24 hours


def create_session(wallet_addr: str, chain_id: str, ttl_seconds: int = DEFAULT_TTL) -> dict:
    """Create new session, returns dict with token, wallet_addr, chain_id, expires_at."""
    session_token = secrets.token_urlsafe(48)
    expires_at = int(time.time()) + ttl_seconds
    _SESSIONS[session_token] = {
        "wallet_addr": wallet_addr,
        "chain_id": chain_id,
        "expires_at": expires_at,
    }
    return {
        "session_token": session_token,
        "wallet_addr": wallet_addr,
        "chain_id": chain_id,
        "expires_at": expires_at,
    }


def get_session(token: str) -> Optional[dict]:
    """Get session if valid (exists and not expired). Returns None if invalid."""
    if not token:
        return None
    session = _SESSIONS.get(token)
    if not session:
        return None
    if session["expires_at"] < int(time.time()):
        _SESSIONS.pop(token, None)
        return None
    return session


def delete_session(token: str) -> bool:
    """Delete session. Returns True if session existed."""
    return _SESSIONS.pop(token, None) is not None
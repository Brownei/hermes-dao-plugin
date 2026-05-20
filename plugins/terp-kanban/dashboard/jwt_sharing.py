"""JWT-based share token generation and validation for Terp Kanban boards.

Share tokens are JWTs signed with HMAC-SHA256 using a secret derived from
the owner's bech32 address. The token payload contains:

    iss  — owner bech32 address
    sub  — board slug
    role — "viewer" or "editor"
    exp  — expiration timestamp
    iat  — issued-at timestamp
    jti  — unique share ID (same as the DB row id)

The token is used as the share_id stored in the ``board_shares`` table.
"""

from __future__ import annotations

import hashlib
import time
from typing import Optional

import jwt  # PyJWT

# Bech32 prefix for Terp Network addresses
TERP_BECH32_PREFIX = "terp"

# Secret salt — used to derive per-owner signing keys
_SECRET_SALT = b"terp-kanban-share-v1"


def _owner_secret(owner_address: str) -> bytes:
    """Derive a deterministic HMAC secret from the owner's bech32 address."""
    return hashlib.sha256(_SECRET_SALT + owner_address.encode()).digest()


def create_share_token(
    owner_address: str,
    board_slug: str,
    role: str = "viewer",
    days: int = 14,
) -> str:
    """Create a signed JWT share token.

    Returns the token string (URL-safe, no padding).
    """
    now = int(time.time())
    exp = now + (days * 24 * 60 * 60)
    jti = hashlib.sha256(
        f"{owner_address}:{board_slug}:{now}:{role}".encode()
    ).hexdigest()[:16]

    payload = {
        "iss": owner_address,
        "sub": board_slug,
        "role": role,
        "exp": exp,
        "iat": now,
        "jti": jti,
    }

    secret = _owner_secret(owner_address)
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token


def decode_share_token(token: str) -> Optional[dict]:
    """Decode a share token WITHOUT validation (inspect only).

    Returns the payload dict, or None if the token is malformed.
    """
    try:
        # Decode without verify to inspect the payload
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception:
        return None


def validate_share_token(token: str) -> Optional[dict]:
    """Validate a share token and return its payload.

    Checks signature, expiration, and required fields.
    Returns the payload dict, or None if invalid.
    """
    try:
        # First decode without verify to get the issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        owner = unverified.get("iss")
        if not owner:
            return None

        # Now verify with the owner-derived secret
        secret = _owner_secret(owner)
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iss", "sub", "role"]},
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    except Exception:
        return None


def is_valid_bech32(address: str, expected_prefix: str) -> bool:
    """Check if an address is a valid bech32 string with the expected prefix."""
    try:
        import bech32
        prefix, data = bech32.bech32_decode(address)
        if prefix is not None and data is not None and prefix == expected_prefix:
            return True
    except Exception:
        pass

    # Fallback: basic format check
    if not address.startswith(expected_prefix + "1"):
        return False
    # Must be alphanumeric (except '1') and reasonable length (42-65 chars typical)
    if len(address) < 42 or len(address) > 65:
        return False
    return True

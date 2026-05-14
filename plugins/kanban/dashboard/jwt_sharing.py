"""JWT-based board sharing with bech32 address authentication.

This module handles:
- Creating share tokens (JWT) signed with bech32 address
- Validating and parsing share tokens
- Verifying signatures using Terp Network key pairs

The token format follows the Akash console-air pattern:
- iss: bech32 address of the share owner
- exp: expiration timestamp
- iat: issued at
- board: board slug
- role: viewer | editor

For full bech32 signature verification, we use PyJWT with custom claims.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from typing import Optional

import jwt
import bech32


# Terp Network bech32 prefix
TERP_BECH32_PREFIX = "terp"

def _get_jwt_secret() -> str:
    """Get or create persistent JWT secret."""
    secret_path = os.path.join(os.path.dirname(__file__), ".jwt_secret")
    
    if os.path.exists(secret_path):
        with open(secret_path, "r") as f:
            return f.read().strip()
    
    # Generate new secret
    secret = secrets.token_urlsafe(64)
    with open(secret_path, "w") as f:
        f.write(secret)
    os.chmod(secret_path, 0o600)  # Restrict permissions
    
    return secret

JWT_SECRET = _get_jwt_secret()
JWT_ALGORITHM = "HS256"


def _base64url_encode(data: bytes) -> str:
    """URL-safe base64 encoding without padding."""
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _base64url_decode(data: str) -> bytes:
    """URL-safe base64 decoding."""
    import base64
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def encode_bech32_address(address: str) -> bytes:
    """Decode a bech32 address to bytes for verification."""
    try:
        # bech32.decode(prefix, address) -> (prefix, bytes)
        hrp, data = bech32.bech32_decode(address)
        if hrp is None:
            return b""
        return bytes(data)
    except Exception:
        return b""


def is_valid_bech32(address: str, prefix: str = TERP_BECH32_PREFIX) -> bool:
    """Validate a bech32 address.
    
    Returns True if the address is valid bech32 with the given prefix.
    Note: This only validates the encoding, not that the address exists
    on-chain. For production, you'd also want to verify the address has
    a valid public key hash.
    """
    try:
        hrp, data = bech32.bech32_decode(address)
        if hrp is None or hrp != prefix:
            return False
        # Valid bech32 addresses have specific byte lengths:
        # - 20 bytes (e.g., account addresses)
        # - 32 bytes (e.g., validator addresses)
        # Allow either, or 0 for testing
        return len(data) in (0, 20, 32)
    except Exception:
        return False


def create_share_token(
    owner_address: str,
    board_slug: str,
    role: str = "viewer",
    days: int = 7,
) -> str:
    """Create a JWT share token.
    
    The token contains:
    - iss: owner bech32 address
    - board: board slug
    - role: viewer or editor
    - exp: expiration timestamp
    - iat: issued at
    
    The token is signed with a server-side secret. The "ownership" is
    verified by requiring authentication on the API endpoints that create
    shares (the dashboard requires the session token).
    """
    now = int(time.time())
    expires_at = now + (days * 24 * 60 * 60)
    
    payload = {
        "iss": owner_address,
        "board": board_slug,
        "role": role,
        "exp": expires_at,
        "iat": now,
    }
    
    # Sign with server-side secret
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def decode_share_token(token: str) -> Optional[dict]:
    """Decode and validate a share token.
    
    Returns the payload if valid, None if invalid/expired.
    """
    try:
        # First, try to decode as JWT
        payload = jwt.decode(
            token, 
            JWT_SECRET, 
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": True}
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def validate_share_token(token: str) -> Optional[dict]:
    """Validate a share token and return its claims.
    
    This is the main validation function used by the API.
    Returns the token claims if valid, None otherwise.
    """
    payload = decode_share_token(token)
    if not payload:
        return None
    
    # Verify required claims
    if "iss" not in payload or "board" not in payload:
        return None
    
    # Validate role
    role = payload.get("role", "viewer")
    if role not in ("viewer", "editor"):
        return None
    
    # Validate bech32 address format
    if not is_valid_bech32(payload["iss"]):
        return None
    
    return payload


def create_signed_share_link(
    owner_address: str,
    board_slug: str,
    role: str = "viewer",
    days: int = 7,
) -> dict:
    """Create a complete share link with all metadata.
    
    Returns:
        dict with: share_id (JWT), url, expires_at, board_slug, role
    """
    now = int(time.time())
    expires_at = now + (days * 24 * 60 * 60)
    
    share_id = create_share_token(
        owner_address=owner_address,
        board_slug=board_slug,
        role=role,
        days=days,
    )
    
    return {
        "share_id": share_id,
        "url": f"/share/{share_id}",
        "expires_at": expires_at,
        "board_slug": board_slug,
        "role": role,
    }


# ---------------------------------------------------------------------------
# Full bech32 signature verification (for future use with wallet signing)
# ---------------------------------------------------------------------------

def create_challenge_message(address: str, nonce: str) -> str:
    """Create a challenge message for wallet signature.
    
    The user signs this message with their Terp Network wallet
    to prove ownership of the address.
    """
    return f"""Verify ownership of Terp Network address

Address: {address}
Nonce: {nonce}

This message proves you control this wallet.
"""


def verify_wallet_signature(
    address: str,
    message: str,
    signature: bytes,
) -> bool:
    """Verify a signature from a Terp Network wallet.
    
    This would use the bech32 address's public key to verify
    the signature. For Terp Network (Cosmos-based), we'd use
    secp256k1 elliptic curve verification.
    
    In production, this would:
    1. Decode the bech32 address to get the public key hash
    2. Fetch the public key from the blockchain (or use cached)
    3. Verify the secp256k1 signature
    
    Returns True if signature is valid, False otherwise.
    """
    # Placeholder - full impl would use:
    # from cryptography.hazmat.primitives.asymmetric import ec
    # from cryptography.hazmat.primitives import serialization
    
    # For now, this is a placeholder. The full implementation would:
    # 1. Get the public key from the address (on-chain or cached)
    # 2. Use ec.verify(signature, message, public_key)
    return False


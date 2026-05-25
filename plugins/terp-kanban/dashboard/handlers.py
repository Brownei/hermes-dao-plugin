"""Terp Kanban handlers - all business logic for wallet/session/board operations.

This module contains all the functions used by the terp-kanban plugin API.
No imports from main kanban plugin - completely self-contained.
"""

import json
import logging
import secrets
import time
from typing import Any, Optional

from fastapi import HTTPException, Request, Response

from hermes_cli import kanban_db
from hermes_cli.kanban_db import (
    get_board_member_role,
    get_board_members,
    add_board_member,
    remove_board_member,
    update_board_member_role,
)
from hermes_cli.wallet_sessions import create_session, get_session, delete_session
from hermes_constants import get_hermes_home

log = logging.getLogger(__name__)


def _get_wallet(request: Request) -> dict | None:
    """Get optional wallet from session - no auth required."""
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    return get_session(token)


# ============================================================================
# Session Handlers
# ============================================================================

def handle_create_session(payload: dict, response: Response) -> dict:
    """Create a simple session for the connected wallet (no signature required)."""
    address = payload.get("address", "")
    chain_id = payload.get("chain_id", "")
    
    result = create_session(address, chain_id)
    
    response.set_cookie(
        key="wallet_session",
        value=result["session_token"],
        expires=result["expires_at"],
        httponly=True,
        samesite="strict",
        path="/"
    )
    
    return result


def handle_get_session(request: Request) -> dict:
    """Get current wallet session."""
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    session = get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="No valid session")
    return session


def handle_logout(request: Request, response: Response) -> dict:
    """Logout and clear session."""
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    if token:
        delete_session(token)
    response.delete_cookie(key="wallet_session", path="/")
    return {"ok": True}


# ============================================================================
# Board Handlers
# ============================================================================

def handle_list_boards(request: Request) -> dict:
    """List boards where current wallet is a member.
    Returns empty list if wallet not connected."""
    wallet = _get_wallet(request)
    
    if not wallet:
        return {"boards": []}
    
    wallet_addr = wallet["wallet_addr"]
    boards_dir = get_hermes_home() / "kanban" / "boards"
    boards = []
    
    if boards_dir.is_dir():
        for child in sorted(boards_dir.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir() or not (child / "board.json").exists():
                continue
            slug = child.name
            if not (child / "kanban.db").exists():
                continue
            
            conn = kanban_db.connect(board=slug)
            try:
                role = get_board_member_role(conn, slug, wallet_addr)
                if role:
                    meta = kanban_db.read_board_metadata(slug)
                    meta["my_role"] = role
                    boards.append(meta)
            finally:
                conn.close()
    
    return {"boards": boards}


def handle_create_board(payload: dict, request: Request) -> dict:
    """Create a new board - public (no auth required).
    Board creator gets admin role if wallet connected."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None
    
    slug = payload.get("slug", "")
    name = payload.get("name", "")
    author_name = payload.get("author_name", "")
    chain_id = payload.get("chain_id", "")
    
    if not slug or not name:
        raise HTTPException(status_code=400, detail="slug and name required")
    
    try:
        meta = kanban_db.create_board(
            slug=slug,
            name=name,
            description=payload.get("description", ""),
            icon=payload.get("icon", ""),
            color=payload.get("color", ""),
            created_by_wallet=wallet_addr,
            author_name=author_name,
            chain_id=chain_id,
        )
        
        # Auto-grant admin to creator
        if wallet_addr:
            conn = kanban_db.connect(board=slug)
            try:
                add_board_member(conn, slug, wallet_addr, "admin", author_name)
            finally:
                conn.close()
        
        return {"ok": True, "board": meta}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def handle_get_board(board_slug: str, request: Request) -> dict:
    """Get board details - returns board if user is a member, 404 otherwise."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None

    if not kanban_db.board_exists(board_slug):
        raise HTTPException(status_code=404, detail=f"Board {board_slug!r} not found")

    if not wallet_addr:
        raise HTTPException(status_code=404, detail="Board not found or not accessible")

    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, wallet_addr)
        if not role:
            raise HTTPException(status_code=404, detail="Board not found or not accessible")
        
        meta = kanban_db.read_board_metadata(board_slug)
        meta["my_role"] = role
        
        columns = kanban_db.get_columns(conn, board_slug)
        tasks = kanban_db.get_tasks(conn, board_slug)
        
        return {"board": meta, "columns": columns, "tasks": tasks}
    finally:
        conn.close()


def handle_delete_board(board_slug: str, request: Request) -> dict:
    """Delete board - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    wallet_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, wallet_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        kanban_db.delete_board(board_slug)
        return {"ok": True}
    finally:
        conn.close()


# ============================================================================
# Member Handlers
# ============================================================================

def handle_list_members(board_slug: str, request: Request) -> dict:
    """List board members - requires board membership."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Board member access required")
    
    wallet_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, wallet_addr)
        if not role:
            raise HTTPException(status_code=403, detail="Board member access required")
        
        members = get_board_members(conn, board_slug)
        return {"members": members}
    finally:
        conn.close()


def handle_add_member(board_slug: str, payload: dict, request: Request) -> dict:
    """Add board member - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    wallet_addr = wallet["wallet_addr"]
    new_member_addr = payload.get("wallet_addr", "")
    new_role = payload.get("role", "viewer")
    author_name = payload.get("author_name", "")
    
    if not new_member_addr:
        raise HTTPException(status_code=400, detail="wallet_addr required")
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, wallet_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        add_board_member(conn, board_slug, new_member_addr, new_role, author_name)
        return {"ok": True}
    finally:
        conn.close()


def handle_remove_member(board_slug: str, wallet_addr: str, request: Request) -> dict:
    """Remove board member - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    admin_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, admin_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        remove_board_member(conn, board_slug, wallet_addr)
        return {"ok": True}
    finally:
        conn.close()


def handle_update_member_role(board_slug: str, wallet_addr: str, payload: dict, request: Request) -> dict:
    """Update member role - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    admin_addr = wallet["wallet_addr"]
    new_role = payload.get("role", "viewer")
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = get_board_member_role(conn, board_slug, admin_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        update_board_member_role(conn, board_slug, wallet_addr, new_role)
        return {"ok": True}
    finally:
        conn.close()


# ============================================================================
# Share Handlers
# ============================================================================

def handle_view_share(share_token: str, request: Request) -> dict:
    """View shared board - accessible if user is a member of the board."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None
    
    boards_dir = get_hermes_home() / "kanban" / "boards"
    
    for child in boards_dir.iterdir():
        if not child.is_dir():
            continue
        board_json = child / "board.json"
        if not board_json.exists():
            continue
        
        try:
            board_data = json.loads(board_json.read_text())
            shares = board_data.get("shares", [])
            for share in shares:
                if share.get("token") == share_token:
                    slug = child.name
                    
                    # Check membership if wallet connected
                    if wallet_addr:
                        conn = kanban_db.connect(board=slug)
                        try:
                            role = get_board_member_role(conn, slug, wallet_addr)
                            if not role:
                                raise HTTPException(status_code=403, detail="Board member access required")
                        finally:
                            conn.close()
                    
                    return {"token": share_token, "board_slug": slug}
        except Exception as e:
            log.warning(f"Error reading board {child.name}: {e}")
            continue
    
    raise HTTPException(status_code=404, detail="Share not found")


def handle_get_share_data(share_token: str, request: Request) -> dict:
    """Get shared board data - accessible if user is a member."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None
    
    boards_dir = get_hermes_home() / "kanban" / "boards"
    board_slug = None
    
    for child in boards_dir.iterdir():
        if not child.is_dir():
            continue
        board_json = child / "board.json"
        if not board_json.exists():
            continue
        
        try:
            board_data = json.loads(board_json.read_text())
            shares = board_data.get("shares", [])
            for share in shares:
                if share.get("token") == share_token:
                    board_slug = child.name
                    break
            if board_slug:
                break
        except Exception as e:
            log.warning(f"Error reading board {child.name}: {e}")
            continue
    
    if not board_slug:
        raise HTTPException(status_code=404, detail="Share not found")
    
    # Check membership
    if wallet_addr:
        conn = kanban_db.connect(board=board_slug)
        try:
            role = get_board_member_role(conn, board_slug, wallet_addr)
            if not role:
                raise HTTPException(status_code=403, detail="Board member access required")
        finally:
            conn.close()
    
    # Return board data
    meta = kanban_db.read_board_metadata(board_slug)
    conn = kanban_db.connect(board=board_slug)
    try:
        columns = kanban_db.get_columns(conn, board_slug)
        tasks = kanban_db.get_tasks(conn, board_slug)
        members = get_board_members(conn, board_slug)
        return {"board": meta, "columns": columns, "tasks": tasks, "members": members}
    finally:
        conn.close()


def handle_public_list_boards() -> dict:
    """Return all boards without requiring wallet authentication."""
    boards_dir = get_hermes_home() / "kanban" / "boards"
    boards = []

    if boards_dir.is_dir():
        for child in sorted(boards_dir.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir() or not (child / "board.json").exists():
                continue
            slug = child.name
            if not (child / "kanban.db").exists():
                continue
            try:
                meta = kanban_db.read_board_metadata(slug)
                meta["my_role"] = None
                boards.append(meta)
            except Exception:
                continue

    return {"boards": boards}


def handle_get_config() -> dict:
    """Return wallet config."""
    return {"enabled": True, "required": False, "chains": [], "session_ttl_seconds": 86400}


def handle_get_challenge(request: Request) -> dict:
    """Generate auth challenge - simplified version."""
    nonce = secrets.token_urlsafe(32)
    now = int(time.time())
    expires_at = now + 300  # 5 minutes
    
    chain_id = request.query_params.get("chain_id", "terp-1")
    
    return {
        "nonce": nonce,
        "chain_id": chain_id,
        "message": f"terp-kanban:{nonce}:{now}",
        "expires_at": expires_at,
    }
"""Terp Kanban Wallet plugin — wallet auth + board sharing.

Re-exports the wallet and share routes from the main kanban plugin so
the terp-kanban tab has its own API namespace at /api/plugins/terp-kanban/.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Response

from hermes_cli import kanban_db
from hermes_cli.wallet_sessions import create_session, get_session, delete_session

log = logging.getLogger(__name__)

router = APIRouter()

# Import only the public routes from main kanban plugin
try:
    from plugins.kanban.dashboard.plugin_api import (
        get_wallet_config,
        get_wallet_challenge,
        verify_wallet,
        get_wallet_me,
        public_list_boards,
        create_share,
        list_shares,
        revoke_share,
        validate_share,
    )

    router.get("/wallet/config")(get_wallet_config)
    router.get("/wallet/challenge")(get_wallet_challenge)
    router.post("/wallet/verify")(verify_wallet)
    router.get("/wallet/me")(get_wallet_me)
    router.get("/wallet/boards/public")(public_list_boards)

    router.post("/shares")(create_share)
    router.get("/shares")(list_shares)
    router.delete("/shares/{share_id}")(revoke_share)
    router.get("/shares/validate/{share_id}")(validate_share)

    log.info("terp-kanban: imported public routes from main kanban plugin")

except ImportError as e:
    log.warning("terp-kanban: could not import kanban routes: %s", e)


# Get optional wallet from session (no auth required)
def _get_wallet(request: Request) -> dict | None:
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    return get_session(token)


# Session endpoints using shared module

@router.post("/wallet/session")
def create_wallet_session(payload: dict, response: Response):
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


@router.get("/wallet/me")
def get_wallet_session(request: Request):
    """Get current wallet session."""
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    session = get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="No valid session")
    return session


@router.post("/wallet/logout")
def logout_wallet_session(request: Request, response: Response):
    """Logout and clear session."""
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    if token:
        delete_session(token)
    response.delete_cookie(key="wallet_session", path="/")
    return {"ok": True}


# List boards - requires wallet connected, returns only boards where user is member

@router.get("/wallet/boards")
def list_boards(request: Request):
    """List boards where current wallet is a member - wallet must be connected."""
    from hermes_constants import get_hermes_home
    
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    session = get_session(token)
    
    if not session:
        return {"boards": []}  # Empty list if not connected
    
    wallet_addr = session["wallet_addr"]
    
    boards_dir = get_hermes_home() / "kanban" / "boards"
    boards = []
    
    if boards_dir.is_dir():
        for child in sorted(boards_dir.iterdir(), key=lambda p: p.name.lower()):
            if not child.is_dir() or not (child / "board.json").exists():
                continue
            slug = child.name
            if not (child / "kanban.db").exists():
                continue
            
            # Check if user is a member
            conn = kanban_db.connect(board=slug)
            try:
                role = kanban_db.get_board_member_role(conn, slug, wallet_addr)
                if role:
                    meta = kanban_db.read_board_metadata(slug)
                    meta["my_role"] = role
                    boards.append(meta)
            finally:
                conn.close()
    
    return {"boards": boards}


# Board creation - PUBLIC (no auth required), auto-admin to creator

@router.post("/wallet/boards")
def create_board(payload: dict, request: Request, response: Response):
    """Create a new board - public (no auth required). Board creator gets admin role."""
    # Get optional wallet - don't require auth
    token = request.cookies.get("wallet_session") or request.headers.get("x-wallet-session")
    session = get_session(token)
    wallet_addr = session["wallet_addr"] if session else None
    
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
                kanban_db.add_board_member(conn, slug, wallet_addr, "admin", author_name)
            finally:
                conn.close()
        
        return {"ok": True, "board": meta}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Board routes with optional-auth (no 401, return appropriate responses instead)

@router.get("/wallet/boards/{board_slug}")
def get_board(board_slug: str, request: Request):
    """Get board details - returns board if user is a member, 404 otherwise."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None

    if not kanban_db.board_exists(board_slug):
        raise HTTPException(status_code=404, detail=f"Board {board_slug!r} not found")

    # If no wallet connected, check if board is accessible (public boards would work)
    if not wallet_addr:
        raise HTTPException(status_code=404, detail="Board not found or not accessible")

    # Check if user is a member
    conn = kanban_db.connect(board=board_slug)
    try:
        role = kanban_db.get_board_member_role(conn, board_slug, wallet_addr)
        if not role:
            raise HTTPException(status_code=404, detail="Board not found or not accessible")
        
        meta = kanban_db.read_board_metadata(board_slug)
        meta["my_role"] = role
        
        # Get columns
        columns = kanban_db.get_columns(conn, board_slug)
        tasks = kanban_db.get_tasks(conn, board_slug)
        
        return {"board": meta, "columns": columns, "tasks": tasks}
    finally:
        conn.close()


@router.delete("/wallet/boards/{board_slug}")
def delete_board(board_slug: str, request: Request):
    """Delete board - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    wallet_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = kanban_db.get_board_member_role(conn, board_slug, wallet_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        kanban_db.delete_board(board_slug)
        return {"ok": True}
    finally:
        conn.close()


@router.get("/wallet/boards/{board_slug}/members")
def list_members(board_slug: str, request: Request):
    """List board members - requires board membership."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Board member access required")
    
    wallet_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = kanban_db.get_board_member_role(conn, board_slug, wallet_addr)
        if not role:
            raise HTTPException(status_code=403, detail="Board member access required")
        
        members = kanban_db.get_board_members(conn, board_slug)
        return {"members": members}
    finally:
        conn.close()


@router.post("/wallet/boards/{board_slug}/members")
def add_member(board_slug: str, payload: dict, request: Request):
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
        role = kanban_db.get_board_member_role(conn, board_slug, wallet_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        kanban_db.add_board_member(conn, board_slug, new_member_addr, new_role, author_name)
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/wallet/boards/{board_slug}/members/{wallet_addr:path}")
def remove_member(board_slug: str, wallet_addr: str, request: Request):
    """Remove board member - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    admin_addr = wallet["wallet_addr"]
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = kanban_db.get_board_member_role(conn, board_slug, admin_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        kanban_db.remove_board_member(conn, board_slug, wallet_addr)
        return {"ok": True}
    finally:
        conn.close()


@router.patch("/wallet/boards/{board_slug}/members/{wallet_addr:path}/role")
def update_member_role(board_slug: str, wallet_addr: str, payload: dict, request: Request):
    """Update member role - requires admin role."""
    wallet = _get_wallet(request)
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    admin_addr = wallet["wallet_addr"]
    new_role = payload.get("role", "viewer")
    
    conn = kanban_db.connect(board=board_slug)
    try:
        role = kanban_db.get_board_member_role(conn, board_slug, admin_addr)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        kanban_db.update_board_member_role(conn, board_slug, wallet_addr, new_role)
        return {"ok": True}
    finally:
        conn.close()


# Share routes with optional-auth

@router.get("/share/{share_token}")
def view_share(share_token: str, request: Request):
    """View shared board - accessible if user is a member of the board."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None
    
    try:
        from plugins.kanban.dashboard.plugin_api import view_shared_board
        return view_shared_board(share_token, request)
    except ImportError:
        # Fallback: basic share token validation
        from hermes_cli import kanban_db
        from hermes_constants import get_hermes_home
        
        boards_dir = get_hermes_home() / "kanban" / "boards"
        for child in boards_dir.iterdir():
            if not child.is_dir():
                continue
            board_json = child / "board.json"
            if not board_json.exists():
                continue
            
            try:
                import json
                board_data = json.loads(board_json.read_text())
                shares = board_data.get("shares", [])
                for share in shares:
                    if share.get("token") == share_token:
                        slug = child.name
                        # Check membership if wallet connected
                        if wallet_addr:
                            conn = kanban_db.connect(board=slug)
                            try:
                                role = kanban_db.get_board_member_role(conn, slug, wallet_addr)
                                if not role:
                                    raise HTTPException(status_code=403, detail="Board member access required")
                            finally:
                                conn.close()
                        return {"token": share_token, "board_slug": slug}
            except Exception:
                continue
        
        raise HTTPException(status_code=404, detail="Share not found")


@router.get("/share/{share_token}/data")
def get_share_data(share_token: str, request: Request):
    """Get shared board data - accessible if user is a member."""
    wallet = _get_wallet(request)
    wallet_addr = wallet["wallet_addr"] if wallet else None
    
    # Find board by share token
    from hermes_cli import kanban_db
    from hermes_constants import get_hermes_home
    
    boards_dir = get_hermes_home() / "kanban" / "boards"
    board_slug = None
    
    for child in boards_dir.iterdir():
        if not child.is_dir():
            continue
        board_json = child / "board.json"
        if not board_json.exists():
            continue
        
        try:
            import json
            board_data = json.loads(board_json.read_text())
            shares = board_data.get("shares", [])
            for share in shares:
                if share.get("token") == share_token:
                    board_slug = child.name
                    break
            if board_slug:
                break
        except Exception:
            continue
    
    if not board_slug:
        raise HTTPException(status_code=404, detail="Share not found")
    
    # Check membership
    if wallet_addr:
        conn = kanban_db.connect(board=board_slug)
        try:
            role = kanban_db.get_board_member_role(conn, board_slug, wallet_addr)
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
        members = kanban_db.get_board_members(conn, board_slug)
        return {"board": meta, "columns": columns, "tasks": tasks, "members": members}
    finally:
        conn.close()

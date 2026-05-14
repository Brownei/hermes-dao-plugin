hermes-agent/hermes_cli/kanban_db.py
```py

# ---------------------------------------------------------------------------
# Board shares (JWT-based share links)
# ---------------------------------------------------------------------------

@dataclass
class BoardShare:
    """A share link for a kanban board."""
    id: str                          # JWT token
    board_slug: str
    owner_address: str              # bech32 address
    role: str                        # 'viewer' or 'editor'
    expires_at: int                  # Unix timestamp
    created_at: int
    last_used_at: Optional[int] = None
    use_count: int = 0
    is_revoked: bool = False


def create_board_share(
    board_slug: str,
    owner_address: str,
    role: str,
    expires_at: int,
    share_id: str,
) -> BoardShare:
    """Create a new share link for a board."""
    now = int(time.time())
    with connect() as conn:
        conn.execute(
            """INSERT INTO board_shares 
               (id, board_slug, owner_address, role, expires_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (share_id, board_slug, owner_address, role, expires_at, now),
        )
    return BoardShare(
        id=share_id,
        board_slug=board_slug,
        owner_address=owner_address,
        role=role,
        expires_at=expires_at,
        created_at=now,
    )


def get_board_share(share_id: str) -> Optional[BoardShare]:
    """Get a share by ID. Returns None if not found or revoked."""
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM board_shares WHERE id = ? AND is_revoked = 0",
            (share_id,),
        ).fetchone()
        if not row:
            return None
        return BoardShare(
            id=row["id"],
            board_slug=row["board_slug"],
            owner_address=row["owner_address"],
            role=row["role"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            last_used_at=row["last_used_at"],
            use_count=row["use_count"],
            is_revoked=bool(row["is_revoked"]),
        )


def list_board_shares(board_slug: str) -> list[BoardShare]:
    """List all non-revoked shares for a board."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM board_shares WHERE board_slug = ? AND is_revoked = 0 ORDER BY created_at DESC",
            (board_slug,),
        ).fetchall()
    return [
        BoardShare(
            id=row["id"],
            board_slug=row["board_slug"],
            owner_address=row["owner_address"],
            role=row["role"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            last_used_at=row["last_used_at"],
            use_count=row["use_count"],
            is_revoked=bool(row["is_revoked"]),
        )
        for row in rows
    ]


def revoke_board_share(share_id: str) -> bool:
    """Revoke a share link. Returns True if revoked, False if not found."""
    with connect() as conn:
        cursor = conn.execute(
            "UPDATE board_shares SET is_revoked = 1 WHERE id = ?",
            (share_id,),
        )
        return cursor.rowcount > 0


def validate_share_token(share_id: str) -> Optional[BoardShare]:
    """Validate a share token and record usage.
    
    Returns the BoardShare if valid, None if invalid/expired/revoked.
    """
    share = get_board_share(share_id)
    if not share:
        return None
    
    now = int(time.time())
    if share.expires_at < now:
        return None
    
    # Record usage
    with connect() as conn:
        conn.execute(
            "UPDATE board_shares SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?",
            (now, share_id),
        )
    
    return share



```



add user profiling to kanban_db
```py
-- Board share links with JWT-based authentication
-- Token = JWT signed with owner's bech32 address
-- Supports viewer/editor roles with optional expiration
CREATE TABLE IF NOT EXISTS board_shares (
    id                  TEXT PRIMARY KEY,           -- JWT token (url-safe)
    board_slug          TEXT NOT NULL,
    owner_address       TEXT NOT NULL,               -- bech32 address of creator
    role                TEXT NOT NULL CHECK(role IN ('viewer', 'editor')),
    expires_at           INTEGER NOT NULL,             -- Unix timestamp
    created_at          INTEGER NOT NULL,
    last_used_at        INTEGER,
    use_count           INTEGER DEFAULT 0,
    is_revoked          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shares_board         ON board_shares(board_slug);
CREATE INDEX IF NOT EXISTS idx_shares_owner        ON board_shares(owner_address);
CREATE INDEX IF NOT EXISTS idx_shares_expires       ON board_shares(expires_at);
```



### plugin_apy.py


```py



# ---------------------------------------------------------------------------
# Board shares (JWT-based share links)
# ---------------------------------------------------------------------------
@router.post("/shares")
async def create_share(request: Request):
    """Create a share link for a board."""
    from hermes_cli import kanban_db as kb
    from .jwt_sharing import create_share_token, is_valid_bech32, TERP_BECH32_PREFIX
    import time
    import traceback
    
    try:
        body = await request.json()
        
        # FIX 1: Handle null/"never" expiration - default to 14 days
        expires_in = body.get("expires_in_days")
        if expires_in is None or expires_in == "never":
            days = 14
        else:
            days = int(expires_in)
        
        owner_address = body.get("owner_address")
        role = body.get("role", "viewer")
        
        # FIX 2: Get board from body OR query params (withBoard adds to query)
        board = body.get("board") or request.query_params.get("board")
        
        # Debug logging
        print(f"[SHARE DEBUG] board={board}, owner={owner_address}, role={role}, days={days}")
        
        # Validate
        if not board:
            raise HTTPException(status_code=400, detail="board is required")
        
        if not owner_address:
            raise HTTPException(status_code=400, detail="owner_address is required")
        
        if not is_valid_bech32(owner_address, TERP_BECH32_PREFIX):
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid bech32 address. Must start with '{TERP_BECH32_PREFIX}'"
            )
        
        if role not in ("viewer", "editor"):
            raise HTTPException(status_code=400, detail="Role must be 'viewer' or 'editor'")
        
        # Resolve board slug
        board_slug = _resolve_board(board)
        if not board_slug:
            board_slug = kb.DEFAULT_BOARD
        
        # Create share
        expires_at = int(time.time()) + (days * 24 * 60 * 60)
        
        share_id = create_share_token(
            owner_address=owner_address,
            board_slug=board_slug,
            role=role,
            days=days,
        )
        
        share = kb.create_board_share(
            board_slug=board_slug,
            owner_address=owner_address,
            role=role,
            expires_at=expires_at,
            share_id=share_id,
        )
        
        return {
            "share_id": share.id,  # Change to "token" if frontend expects it
            "board_slug": share.board_slug,
            "role": share.role,
            "expires_at": share.expires_at,
            "url": f"/share/{share.id}",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SHARE ERROR] {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
        

@router.get("/shares")
async def list_shares(board: str = Query(..., description="Board slug")):
    """List all share links for a board."""
    from hermes_cli import kanban_db as kb
    
    board_slug = _resolve_board(board)
    if not board_slug:
        board_slug = kb.DEFAULT_BOARD
    
    shares = kb.list_board_shares(board_slug)
    return {
        "shares": [
            {
                "share_id": s.id,
                "board_slug": s.board_slug,
                "role": s.role,
                "expires_at": s.expires_at,
                "created_at": s.created_at,
                "use_count": s.use_count,
                "last_used_at": s.last_used_at,
            }
            for s in shares
        ]
    }


@router.delete("/shares/{share_id}")
async def revoke_share(share_id: str):
    """Revoke a share link."""
    from hermes_cli import kanban_db as kb
    
    success = kb.revoke_board_share(share_id)
    if not success:
        raise HTTPException(status_code=404, detail="Share not found")
    
    return {"status": "revoked", "share_id": share_id}


# ---------------------------------------------------------------------------
# Share view (public endpoint - no auth required, token is in URL)
# ---------------------------------------------------------------------------

@router.get("/share/{share_token}")
async def view_shared_board(share_token: str):
    """Serve a shared board view.
    
    This endpoint validates the share token and serves an HTML page that:
    1. Fetches board data using the token
    2. Renders the board in read-only mode (viewer role)
    
    The token is validated server-side - if invalid/expired, the page
    shows an error message.
    """
    from hermes_cli import kanban_db as kb
    from .jwt_sharing import validate_share_token, decode_share_token
    import time
    
    # Validate the JWT token
    payload = validate_share_token(share_token)
    if not payload:
        # Token invalid or expired
        return {
            "error": "invalid_token",
            "message": "This share link is invalid or has expired.",
        }
    
    board_slug = payload.get("board")
    role = payload.get("role", "viewer")
    
    # Check if share exists in DB (for tracking use_count)
    share = kb.get_board_share(share_token)
    if not share:
        # Token valid but no DB record - create one or reject
        return {
            "error": "not_found",
            "message": "This share link no longer exists.",
        }
    
    # Check expiration
    now = int(time.time())
    if share.expires_at and share.expires_at < now:
        return {
            "error": "expired",
            "message": "This share link has expired.",
        }
    
    # Update use_count (handled by validate_share_token which we call first)
    # Return board info for the frontend
    return {
        "valid": True,
        "board_slug": board_slug,
        "role": role,
        "owner": payload.get("iss"),
        "expires_at": payload.get("exp"),
    }


@router.get("/share/{share_token}/data")
async def get_shared_board_data(share_token: str):
    """Get the full board data for a shared view.
    
    Returns board columns and tasks in read-only mode.
    """
    from hermes_cli import kanban_db as kb
    import time
    
    # Validate the JWT token (this also increments use_count)
    share = kb.validate_share_token(share_token)
    if not share:
        raise HTTPException(status_code=401, detail="Invalid or expired share token")
    
    # Use the board_slug from the validated share
    board_slug = share.board_slug
    role = share.role
    
    # Fetch board data
    with kb.read_txn(kb.get_db()) as conn:
        board = kb.get_board_by_slug(conn, board_slug)
        if not board:
            raise HTTPException(status_code=404, detail="Board not found")
        
        tasks = kb.get_board_tasks(conn, board_slug)
        columns = kb.get_board_columns(conn, board_slug)
    
    return {
        "board": {
            "slug": board.slug,
            "title": board.title,
            "description": board.description,
        },
        "columns": columns,
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "body": t.body,
                "status": t.status,
                "priority": t.priority,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in tasks
        ],
        "role": role,  # "viewer" or "editor"
        "read_only": role == "viewer",
    }


@router.get("/shares/validate/{share_id}")
async def validate_share(share_id: str):
    """Validate a share token and return board access info."""
    from hermes_cli import kanban_db as kb
    
    share = kb.validate_share_token(share_id)
    if not share:
        raise HTTPException(status_code=404, detail="Invalid or expired share")
    
    return {
        "board_slug": share.board_slug,
        "role": share.role,
        "owner_address": share.owner_address,
        "expires_at": share.expires_at,
    }

```

https://docs.fileverse.io/document/5oQcrrxZHnUb43xQz3tk14
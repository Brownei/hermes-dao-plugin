"""Terp Kanban Wallet plugin — wallet auth + board sharing.

Re-exports the wallet and share routes from the main kanban plugin so
the terp-kanban tab has its own API namespace at /api/plugins/terp-kanban/.
"""

from __future__ import annotations

import importlib
import logging
import os
import sys
import handlers

from fastapi import APIRouter

log = logging.getLogger(__name__)

router = APIRouter()

# Import all wallet and share routes from the main kanban plugin
try:
    # Try relative import first (when loaded as a plugin)
    from .handlers import (
        get_wallet_config,
        get_wallet_challenge,
        verify_wallet,
        logout_wallet,
        get_wallet_me,
        wallet_create_board,
        wallet_list_boards,
        public_list_boards,
        wallet_get_board,
        wallet_delete_board,
        wallet_list_members,
        wallet_add_member,
        wallet_remove_member,
        wallet_update_member_role,
        create_share,
        list_shares,
        revoke_share,
        view_shared_board,
        get_shared_board_data,
        validate_share,
    )

    # Mount all wallet routes
    router.get("/wallet/config")(get_wallet_config)
    router.get("/wallet/challenge")(get_wallet_challenge)
    router.post("/wallet/verify")(verify_wallet)
    router.post("/wallet/logout")(logout_wallet)
    router.get("/wallet/me")(get_wallet_me)
    router.post("/wallet/boards")(wallet_create_board)
    router.get("/wallet/boards/public")(public_list_boards)
    router.get("/wallet/boards")(wallet_list_boards)
    router.get("/wallet/boards/{board_slug}")(wallet_get_board)
    router.delete("/wallet/boards/{board_slug}")(wallet_delete_board)
    router.get("/wallet/boards/{board_slug}/members")(wallet_list_members)
    router.post("/wallet/boards/{board_slug}/members")(wallet_add_member)
    router.delete("/wallet/boards/{board_slug}/members/{wallet_addr:path}")(wallet_remove_member)
    router.patch("/wallet/boards/{board_slug}/members/{wallet_addr:path}/role")(wallet_update_member_role)

    # Mount all share routes
    router.post("/shares")(create_share)
    router.get("/shares")(list_shares)
    router.delete("/shares/{share_id}")(revoke_share)
    router.get("/share/{share_token}")(view_shared_board)
    router.get("/share/{share_token}/data")(get_shared_board_data)
    router.get("/shares/validate/{share_id}")(validate_share)

    log.info("terp-kanban: imported wallet and share routes from main kanban plugin")

except ImportError as e:
    log.warning("terp-kanban: could not import kanban routes: %s", e)

    # Fallback: minimal stub routes
    from fastapi import HTTPException, Query, Request
    from pydantic import BaseModel

    @router.get("/wallet/config")
    def fallback_config():
        return {"enabled": True, "required": False, "chains": [], "session_ttl_seconds": 86400}

    @router.get("/wallet/me")
    def fallback_me(request: Request):
        raise HTTPException(status_code=401, detail="Wallet routes unavailable")


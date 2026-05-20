# Terp Kanban — Project Structure & Design

## Overview

Terp Kanban is a wallet-authenticated board management layer built on top of the
existing Hermes Kanban plugin. It adds Cosmos wallet login (Keplr/Leap/Cosmostation),
role-based board access (admin/editor/viewer), and JWT-based share links.

## Directory Structure

```
plugins/terp-kanban/dashboard/
├── manifest.json          # Plugin manifest — defines tab position and entry point
├── plugin_api.py          # Route mounting layer — imports and mounts handlers
├── public_paths.py        # Auth whitelist — paths that bypass session middleware
├── kanban_db.py           # Database layer — all SQLite operations
├── jwt_sharing.py         # JWT token generation/validation for share links
├── handlers.py            # All API route definitions (thin wrappers around kanban_db)
├── dist/
│   └── index.js           # Frontend UI bundle
└── __pycache__/
```

## File Responsibilities

### `handlers.py` — All API Routes

Contains **all API route definitions**. Intentionally thin — every handler wraps
`kanban_db` functions or direct SQL queries.

**Route groups:**

| Route Group | Path Prefix | Description |
|-------------|-------------|-------------|
| Core Kanban | `/board`, `/tasks/*`, `/links`, `/dispatch` | Board data, tasks, events, comments, runs |
| Wallet Auth | `/wallet/*` | Config, challenge, verify, logout, me |
| Wallet Boards | `/wallet/boards/*` | Board CRUD with wallet auth |
| Members | `/wallet/boards/{slug}/members/*` | Add/remove/update board members |
| Shares | `/shares`, `/share/*` | JWT share link creation, validation, revocation |
| WebSocket | `/events` | Live event streaming |

### `public_paths.py` — Auth Whitelist

A `frozenset` of API paths that **bypass the dashboard session token middleware**.

```python
_PUBLIC_API_PATHS: frozenset = frozenset({
    "/api/status",
    "/api/config/defaults",
    "/api/config/schema",
    "/api/model/info",
    "/api/dashboard/themes",
    "/api/dashboard/plugins",
    "/api/dashboard/plugins/rescan",
    "/api/plugins/terp-kanban/wallet/boards/public",
    "/api/plugins/terp-kanban/wallet/config",
})
```

Imported by `hermes_cli/web_server.py` to skip auth middleware.

### `kanban_db.py` — Database Layer

Contains **all database interactions**. Single source of truth for SQLite operations.

| Category | Key Functions |
|----------|---------------|
| Connection | `connect()`, `init_db()`, `write_txn()` |
| Path Resolution | `kanban_home()`, `boards_root()`, `board_dir()`, `kanban_db_path()` |
| Board CRUD | `create_board()`, `list_boards()`, `remove_board()`, `board_exists()` |
| Board Members | `add_board_member()`, `remove_board_member()`, `get_board_members()`, `check_board_permission()` |
| Board Columns | `get_board_columns()`, `add_board_column()`, `update_board_column()`, `delete_board_column()` |
| Board Shares | `create_board_share()`, `get_board_share()`, `list_board_shares()`, `revoke_board_share()`, `validate_share_token()` |
| Tasks | `create_task()`, `get_task()`, `list_tasks()`, `assign_task()`, `complete_task()`, `block_task()`, `archive_task()` |
| Task Links | `link_tasks()`, `unlink_tasks()`, `parent_ids()`, `child_ids()` |
| Comments/Events | `add_comment()`, `list_comments()`, `list_events()`, `_append_event()` |
| Runs | `list_runs()`, `_end_run()`, `_synthesize_ended_run()` |
| Claims | `claim_task()`, `heartbeat_claim()`, `reclaim_task()`, `release_stale_claims()` |
| Dispatcher | `dispatch_once()`, `run_daemon()`, `detect_crashed_workers()` |
| Stats | `board_stats()`, `known_assignees()`, `task_age()` |
| Notifications | `add_notify_sub()`, `list_notify_subs()`, `remove_notify_sub()` |
| Worker Context | `build_worker_context()`, `resolve_workspace()`, `read_worker_log()` |

**Schema tables:** `tasks`, `task_links`, `task_comments`, `task_events`, `task_runs`,
`kanban_notify_subs`, `board_columns`, `board_members`, `board_shares`

**Concurrency:** WAL mode + `BEGIN IMMEDIATE` + CAS updates

### `jwt_sharing.py` — JWT Share Tokens

JWT generation/validation for share links.

- `create_share_token()` — HMAC-SHA256 signed JWT
- `validate_share_token()` — Validates signature, expiration, fields
- Secret: `SHA-256("terp-kanban-share-v1" + owner_address)`

### `plugin_api.py` — Route Mounting

Imports handlers and mounts them under `/api/plugins/terp-kanban/`.

### `manifest.json` — Plugin Manifest

Defines tab at `/terp-kanban`, positioned after existing kanban tab.

## Request Flow

```
Browser Request
    │
    ▼
┌─────────────────────────┐
│   Auth Middleware        │
│   Checks public_paths.py │
│   for bypass             │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   plugin_api.py          │
│   (route mounting)       │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   handlers.py            │
│   (API route handlers)   │
│   - Parse request        │
│   - Validate input       │
│   - Call kanban_db       │
│   - Return response      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   kanban_db.py           │
│   (database layer)       │
│   - SQL queries          │
│   - Schema management    │
│   - Connection pooling   │
└─────────────────────────┘
```

## Authentication Layers

### 1. Dashboard Session Token
- **Middleware:** `web_server.auth_middleware`
- **Header:** `X-Hermes-Session-Token` or session cookie
- **Bypass:** Paths in `public_paths.py`

### 2. Wallet Session Token
- **Header:** `x-wallet-session`
- **Storage:** `_WALLET_SESSIONS` dict (in-memory, TTL)
- **Verification:** `_require_wallet()`, `_require_board_member()`, `_require_board_admin()`

### 3. JWT Share Tokens
- **Path:** `/share/{token}`, `/share/{token}/data`
- **Validation:** `jwt_sharing.validate_share_token()` + DB lookup

## Security Considerations

1. Dashboard session token required for all routes; public paths whitelisted in `public_paths.py`
2. Wallet sessions stored in-memory with TTL, separate from dashboard sessions
3. Challenge nonces are single-use, time-limited (5 min)
4. JWT share tokens use per-owner HMAC-SHA256 secret, expiration enforced
5. Bech32 address validation before all operations
6. ECDSA secp256k1 signature verification (derived address must match claimed)
7. Role hierarchy: admin > editor > viewer, enforced at route level

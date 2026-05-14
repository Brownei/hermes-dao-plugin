---
name: cosmos-cosmwasm-ui
description: "Skills for working with CosmWasm smart contracts via dao-dao-ui, particularly for custom smart contract integrations and UI simplification."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [cosmwasm, cosmos, dao-dao-ui, smart-contracts]
    related_skills: [writing-plans, subagent-driven-development]
---

# Cosmos/CosmWasm UI Development

## Overview

Skills for working with CosmWasm smart contracts via dao-dao-ui, particularly for custom smart contract integrations and UI simplification.

## Triggers

Load when:
- Working with dao-dao-ui (Figma-based DAO governance UI for CosmWasm)
- Building UIs for custom CosmWasm smart contracts
- Simplifying dao-dao-ui for specific use cases (infusions, collections, etc.)
- Setting up CosmWasm blockchain connections (Osmosis, Neutron, Terran, etc.)

## Domain Context

### Key Components

**dao-dao-ui:**
- Fork from `da0-da0/dao-dao-ui`
- Built on React + TanStack Query + **Recoil** (not Zustand)
- Uses CosmWasm client libraries for blockchain interaction
- Template engine for generating UIs from smart contract schemas

**CosmWasm Contracts:**
- Burnt-to-mint models (infusions): CwInfuser, Shitstrap
- Run on CosmWasm-compatible chains
- CosmWasm client handles queries and transactions

### Common Patterns

**Contract Integration:**
- Path convention: `/Users/{user}/abstract/{contract-name}/` or SHIT organization
- Use TanStack Query for remote data fetching (auto-caching, deduplication)
- Recoil for state management (dao-dao-ui default)

**UI Simplification Approach:**
1. Fork dao-dao-ui rather than greenfield (preserves working infrastructure)
2. Keep only required modes (Create/Infuse/Watch)
3. Collapse navigation to minimal zones
4. Reuse existing dao-dao-ui components where possible
5. Build vertical slice first (wallet → query → display)

**DIETER Mode Pattern** (for complete UI collapse):
1. Use `dieterModeAtom` Recoil state to detect active DIETER mode (`'create' | 'infuse' | 'watch'`)
2. Lazy-load DIETER components in `[[...slug]].tsx` via React.lazy()
3. Wire zone clicks to DIETER page URLs with shallow `router.push()`
4. Conditionally skip `useDaoTabs()` and DAO tab loading when in DIETER mode
5. Reduce PHASE_LABEL in CollapsedSidebar to reflect actual zones (e.g. `'0-1-2'`)

**CRITICAL: DIETER Route DAO Resolution Bypass**

DIETER mode does NOT work by default because `DaoPageWrapper` in `_app.tsx` forces ALL routes (except `/discord`, `/404`, `/500`, `/_error`) through DAO address resolution. DIETER infuse routes (`/infuse/*`) aren't in the exclusion list, so `DaoPageWrapper` queries the registry, fails to find a DAO for the address, and shows:

```
"We couldn't find a DAO with that address."
[button.returnHome]  →  navigates to "/"
```

**Fix:** Add `router.pathname.startsWith('/infuse')` to the "not a DAO page" check in `_app.tsx`:

```typescript
// Before:
router.pathname === '/_error' ? (

// After:
router.pathname === '/_error' ||
router.pathname.startsWith('/infuse') ? (
```

This lets DIETER routes pass through `AppContextProvider` → `Component` directly, bypassing `DaoPageWrapper` entirely.

See `references/dieter-ui-pattern.md` for detailed implementation guidance.

**Tech Stack:**
- React + TanStack Query (not useEffect)
- Recoil (not Zustand — dao-dao-ui default)
- Cosmjs for blockchain interaction
- Custom provider configuration for agent-assisted development

### Pitfalls

- **Zustand vs Recoil:** Dao-dao-ui uses Recoil. Don't introduce Zustand without explicit reason.
- **Orphaned content during patches:** Large file diff between patch attempts can cause content collisions. After patches, verify file integrity.
- **Contract path case sensitivity:** Check actual paths — `/abstract/shitstrap/contracts/` may be empty or at alternate locations.
- **DIETER mode detection:** DIETER atom values are plain strings (`'create'`, `'infuse'`, `'watch'`), NOT prefixed with `'@production'`. Broken detection: `['create'].includes('@production' + dieterMode)`.
- **Duplicate Recoil state init:** Avoid multiple `useState(dieterModeAtom)` calls in same component — causes hooks violations.
- **DIETER component props:** DIETER components receive `contractAddr` and `userAddr` as props, NOT via context.
- **Slug resolution for DIETER:** Route `/infuse/create` means `slug[0] === 'infuse' && slug[1] === 'create'`, not just `slug[0]`.
- **Subagent file reads:** Subagents may modify files the caller already read. Always call `read_file` before `patch` when delegating UI work.

## Related Tools

- **QMD:** Semantic code indexing for search (optional, lightweight)
- **Trailmark:** Security analysis graph generation (optional)
- **CWDWASM CLI:** Local contract development tooling

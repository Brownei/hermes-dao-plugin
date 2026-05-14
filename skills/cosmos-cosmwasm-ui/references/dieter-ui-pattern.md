# DIETER UI Pattern — DAO-DAO-UI Simplification

着脸Wrapper component that intercepts DAO-DAO-UI routing. Uses lazy loading with React.lazy().

## Core Files Modified

### 1. `[...slug].tsx` — DIETER Page Routing
```typescript
// DIETER components are lazy-imported
const DIETER_MODES: Record<string, React.ElementType> = {
  create: CreateInfusionForm,
  infuse: InfuseMode,
  watch: WatchMode,
}

// Detection: check if dieterMode is one of the valid modes
const isDieterMode = ['create', 'infuse', 'watch'].includes(dieterMode || '')
```

**Common pitfalls:**
- DIETER atom values are plain strings, NOT prefixed with `'@production'` — broken detection: `['create'].includes('@production' + dieterMode)`
- Slug resolution for DIETER routes needs to handle `infuse/create` -> `slug[0] === 'infuse' && slug[1] === 'create'`
- DIETER components receive `contractAddr` and `userAddr` as props, not via context

### 2. `SdaLayout.tsx` — Zone-to-Page Wiring
```typescript
// Map zone clicks to DIETER page URLs
const DIETER_ZONE_MAP: Record<number, string> = {
  0: '/infuse/create',
  1: '/infuse/infuse',
  2: '/infuse/watch',
}

// When DIETER mode is active, use zone-to-page routing
if (isDieterMode && DIETER_ZONE_MAP[zone]) {
  router.push(DIETER_ZONE_MAP[zone], undefined, { shallow: true })
  setDieterMode(zone)
}
```

**Pitfalls discovered:**
- BEWARE duplicate `useState(dieterModeAtom)` calls — causes hooks violations
- Ensure `const router = useRouter()` is available after `export default SdaLayout`

### 3. CollapsedSidebar.tsx — Phase Label and Zone Navigation
```typescript
// Reduce phase label from 6 fake phases to 3 real zones
const PHASE_LABEL = '0-1-2-3' // was '0-1-2-3-45'
```

### 4. Tab Loading Optimization (All Three Files)
```typescript
// Only load DAO-DAO-UI tabs when NOT in DIETER mode
const loadingTabs = isDieterMode ? undefined : useDaoTabs()
```

## Architecture Summary

```
DOS-DAO-UI (Standard Mode)
├── Tabs: Home, Proposals, Treasury, SubDaos, Apps
├── Navigation: Controller-based tabs
└── Collapsed: O O + extra pallets

DIETER Mode (Collapsed)
├── Mode: Create (0), Infuse (1), Watch (2)
├── Navigation: Shallow router.push()
└── Collapsed: O O   0-1-2-3
```

## Verification

1. Check DIETER mode atom is properly set before navigating
2. Verify lazy-loaded components are not `null` before rendering
3. Ensure `useRouter()` is available in both layout and page files
4. Test zone clicks produce correct URL changes

## Related: subagent-delegation Pitfalls

When delegating UI work to subagents:
- Subagents may modify files the caller already read → always `read_file` before `patch`
- Clarify whether `patch` operates on the latest file contents or cached version
- Ensure subagent imports required dependencies (e.g., `react`, `next/router`)

# Iterative Plan Update Pattern

## User Preference (2026-05-01)

**Explicit preference:** "rewriting it is a bad idea. I just want us to iterate"

## Context

When updating implementation plans that have accumulated through multiple sessions:
- Do NOT rewrite the entire document
- DO apply targeted patches to specific sections
- DO clean up orphaned content after patches
- DO verify file integrity after each patch batch

## Pattern

1. **Read** current file state (line count, structure)
2. **Identify** sections needing patching
3. **Patch** one section at a time
4. **Verify** after each patch (no content leakage)
5. **Batch cleanup** orphaned content if needed

## Rationale

- User has invested time in existing plan structure
- Wholesale rewrites lose accumulated domain knowledge
- Iterative patches preserve working sections unchanged
- Orphaned content is a known risk from patch boundary mismatch

## Related

- See `large-file-patch-cleanup.md` for emergency recovery
- Use `writing-plans` skill for creating new plans (not updating)
# Large File Patch Cleanup

## Problem

When patching large files (>500 lines) with multiple sequential patches, mismatched string boundaries can cause:
- Orphaned content fragments in the file
- Duplicate section headers
- Corrupted documentation structure

## Session Context (2026-05-01)

While updating `/Users/returniflost/.hermes/plans/2026-05-01-dao-dao-infusion-simplification.md`:
- Original: 915 lines, accumulated to 819 lines after previous patches
- Issue: Phase 3 header duplicated, React code fragments leaked into documentation sections
- Cleanup: Removed 210 lines of orphaned content (lines 327-536)

## Mitigation

### Before Patching
1. Count lines with `wc -l file`
2. Check for suspicious duplicates: `grep -n "## Phase" file`
3. Verify no React/HTML code in non-code sections

### After Patching
1. Verify line count: `wc -l file`
2. Check for duplicate headers: `grep -n "^## " file`
3. Lint semantic integrity: ensure section markers (`---`) are paired

### Emergency Cleanup Script

```python
import sys

# Find and count section headers
with open(sys.argv[1]) as f:
    lines = f.readlines()

from collections import Counter
headers = Counter()
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('## '):
        headers[stripped] = i

for header, count in headers.items():
    if count > 1:
        print(f"DUPLICATE: '{header}' appears at lines: {count}")
```

## Verification

After cleanup, confirm:
- Single instance of each `## Phase N:` header
- No HTML/TSX code outside of code blocks
- Proper `---` separator pairing
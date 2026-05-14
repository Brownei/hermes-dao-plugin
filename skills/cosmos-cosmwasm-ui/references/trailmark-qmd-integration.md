# Trailmark + QMD Code Graph Integration

## Overview
Trailmark generates structural code graphs (nodes=functions/classes, edges=call relationships) which complement QMD's semantic embeddings. Together they provide both semantic search AND structural code relationship discovery.

## Installation

```bash
# Clone and install Trailmark
git clone https://github.com/trailmark
cd trailmark && pip install -e .

# Verify installation
trailmark --version  # should show v0.3.0 or similar
```

## CLI Usage (Critical — commands differ from docs)

### Analyze (summary output)
```bash
trailmark analyze PATH --language LANG --summary
# Available: javascript, typescript, rust, python, go, etc.
```

### Analyze (full JSON graph output)
```bash
trailmark analyze PATH --language LANG
# Note: NO --summary flag — outputs JSON directly
```

### Available Commands
```
Trailmark v0.2.2
Available: version, analyze, diff, entrypoints, augment
```

### Language Support
- JavaScript/TypeScript: `--language javascript` or `--language typescript`
- Rust: `--language rust`
- Python: `--language python`
- Go: `--language go`

## Project Graph Files Generated

Each project produces two files:

1. `PROJECT-summary.txt` — human-readable summary (node count, function count, edge count, dependencies)
2. `PROJECT-graph.json` — full JSON graph with nodes/edges (typically 50KB-250KB)

### JSON Structure
```json
{
  "language": "rust",
  "root_path": "/path/to/project",
  "summary": {
    "nodes": 62,
    "functions": 40,
    "call_edges": 620,
    "dependencies": ["cosmwasm_std", "cw2", "cw721", ...]
  },
  "nodes": [...],
  "edges": [...]
}
```

## Integration with QMD

1. Generate all graphs first
2. Convert JSON graphs to human-readable text (extract nodes, edges, summary)
3. Ingest into existing QMD collection:

```bash
qmd ingest LABEL --collection DIAGETER-COLLECTION
```

## Pitfalls

- **CLI mismatch**: `trailmark build` does NOT exist. Use `trailmark analyze` instead.
- **Language flags**: Some languages may require exact casing (`rust` not `Rust`)
- **Script flavor**: Python 3.10+ required for proper string handling in wrappers
- **QMD ingestion**: Convert JSON → text before ingestion; QMD embeddings work on natural language

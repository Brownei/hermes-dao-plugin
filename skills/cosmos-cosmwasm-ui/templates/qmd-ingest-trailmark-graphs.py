#!/usr/bin/env python3
"""
QMD Ingestor for Trailmark Code Graphs
Converts Trailmark JSON graphs to human-readable text and ingests into QMD collection.

Usage: python3 qmd-ingest-graphs.py <collection_name> [<graph_dir>]

Requires: qmd CLI installed, trailmark graphs in graph_dir
"""
import os
import json
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 qmd-ingest-graphs.py <collection> [graph_dir]")
        sys.exit(1)
    
    collection_name = sys.argv[1]
    graph_dir = sys.argv[2] if len(sys.argv) > 2 else "graphs"
    
    if not os.path.isdir(graph_dir):
        print(f"Error: Graph directory '{graph_dir}' not found")
        sys.exit(1)
    
    # Find all -graph.json files
    graph_files = sorted([f for f in os.listdir(graph_dir) if f.endswith("-graph.json")])
    
    if not graph_files:
        print(f"No -graph.json files found in '{graph_dir}'")
        sys.exit(1)
    
    for fname in graph_files:
        fpath = os.path.join(graph_dir, fname)
        size = os.path.getsize(fpath)
        
        # Skip if too small (not a graph)
        if size < 48000:
            continue
        
        print(f"Processing: {fname} ({size:,} bytes)")
        
        with open(fpath, 'r') as f:
            data = json.load(f)
        
        # Convert graph to text format
        parts = []
        parts.append(f"## Code Graph: {fname.replace('-graph.json', '')}")
        
        summary = data.get("summary", {})
        parts.append(f"- Language: {summary.get('language', 'unknown')}")
        parts.append(f"- Total nodes: {summary.get('total_nodes', len(data.get('nodes', [])))}")
        parts.append(f"- Total edges: {summary.get('total_edges', len(data.get('edges', [])))}")
        
        # Node types distribution
        node_types = {}
        for node in data.get("nodes", []):
            ntype = node.get("type", node.get("node_type", "unknown"))
            node_types[ntype] = node_types.get(ntype, 0) + 1
        
        if node_types:
            parts.append("\nNode types:")
            for ntype, count in sorted(node_types.items(), key=lambda x: -x[1]):
                parts.append(f"  - {ntype}: {count}")
        
        # Edge types distribution
        edge_types = {}
        for edge in data.get("edges", []):
            etype = edge.get("type", edge.get("edge_type", UNKNOWN if isinstance(edge, dict) else "unknown"))
            edge_types[etype] = edge_types.get(etype, 0) + 1
        
        if edge_types:
            parts.append("\nEdge types:")
            for etype, count in sorted(edge_types.items(), key=lambda x: -x[1]):
                parts.append(f"  - {etype}: {count}")
        
        # Files analyzed
        files = set()
        for node in data.get("nodes", []):
            for key in ["filepath", "source_file", "file"]:
                fp = node.get(key, "")
                if fp:
                    files.add(fp)
        
        parts.append(f"\nFiles analyzed: {len(files)}")
        
        content = "\n".join(parts)
        
        # Write to temp file and ingest
        tmp_file = f"/tmp/qmd-ingest-{fname.replace('-graph.json', '.txt')}"
        with open(tmp_file, 'w') as f:
            f.write(content)
        
        # Execute QMD ingest
        cmd = f"qmd ingest {tmp_file} --collection {collection_name}"
        print(f"  Running: {cmd}")
        os.system(cmd)
        
        # Cleanup
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
        
        print(f"  Ingested: {len(content)} characters")

if __name__ == "__main__":
    main()

"""
O-Line SDL Plugin API
Serves O-Line SDL templates and config for the dashboard plugin.
"""

import os
import glob
import toml
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# SDL directory - configurable via environment variable
SDL_DIR = os.environ.get("SDL_DIR", "/Users/returniflost/abstract/bme/o-line/templates/sdls/oline")
MAIN_SDL_DIR = os.environ.get("SDL_DIR", "/Users/returniflost/abstract/bme/o-line/templates/sdls")

# O-Line config path
OLINE_CONFIG_PATH = os.path.expanduser("~/.oline/config.toml")


class SDLFile(BaseModel):
    """SDL file metadata"""
    name: str
    filename: str
    path: str
    size: int
    phase: Optional[str] = None


class SDLContent(BaseModel):
    """SDL file content"""
    filename: str
    content: str
    path: str


def get_sdl_files() -> List[SDLFile]:
    """Get list of all SDL files in the oline directory."""
    sdl_files = []
    phase_map = {
        "a.yml": "Phase A - Kickoff (Snapshot + Seed + MinIO)",
        "b.yml": "Phase B - Left/Right Tackles (Sentry Nodes)",
        "c.yml": "Phase C - Left/Right Forwards (Validators)",
        "d.yml": "Phase D - Deprecated",
        "e.yml": "Phase E - IBC Relayer",
        "f.yml": "Phase F - Argus Indexer",
        "g.yml": "Phase G - Custom",
        "testnet-a.yml": "Testnet Phase A",
        "testnet-b.yml": "Testnet Phase B",
        "testnet-c.yml": "Testnet Phase C",
        "testnet-v.yml": "Testnet Validator",
        "testnet-lb.yml": "Testnet Load Balancer",
    }
    
    if not os.path.isdir(SDL_DIR):
        return []
    
    for filepath in glob.glob(os.path.join(SDL_DIR, "*.yml")):
        filename = os.path.basename(filepath)
        stat = os.stat(filepath)
        
        # Determine phase from filename
        phase = phase_map.get(filename, "Custom")
        
        sdl_files.append(SDLFile(
            name=filename.replace(".yml", ""),
            filename=filename,
            path=filepath,
            size=stat.st_size,
            phase=phase
        ))
    
    # Sort by phase order
    phase_order = ["a", "b", "c", "d", "e", "f", "g"]
    sdl_files.sort(key=lambda x: (
        999 if not x.filename.startswith("testnet") else 1000,
        phase_order.index(x.name[0]) if x.name[0] in phase_order else 999,
        x.filename
    ))
    
    return sdl_files


@router.get("/api/plugins/oline-sdl/files")
async def list_sdl_files() -> List[SDLFile]:
    """List all available SDL templates."""
    return get_sdl_files()


@router.get("/api/plugins/oline-sdl/files/{filename}")
async def get_sdl_content(filename: str) -> SDLContent:
    """Get the content of a specific SDL file."""
    filepath = os.path.join(SDL_DIR, filename)
    
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail=f"SDL file not found: {filename}")
    
    with open(filepath, "r") as f:
        content = f.read()
    
    return SDLContent(
        filename=filename,
        content=content,
        path=filepath
    )


@router.put("/api/plugins/oline-sdl/files/{filename}")
async def update_sdl_content(filename: str, data: Dict[str, str]) -> Dict[str, str]:
    """Update the content of a specific SDL file."""
    filepath = os.path.join(SDL_DIR, filename)
    
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail=f"SDL file not found: {filename}")
    
    if "content" not in data:
        raise HTTPException(status_code=400, detail="Missing 'content' field")
    
    with open(filepath, "w") as f:
        f.write(data["content"])
    
    return {"status": "saved", "filename": filename}


@router.get("/api/plugins/oline-sdl/config")
async def get_sdl_config() -> Dict[str, Any]:
    """Get SDL directory configuration."""
    return {
        "sdl_dir": SDL_DIR,
        "main_sdl_dir": MAIN_SDL_DIR,
        "exists": os.path.isdir(SDL_DIR),
        "file_count": len(get_sdl_files())
    }


@router.get("/api/plugins/oline-sdl/schema")
async def get_sdl_schema() -> Dict[str, Any]:
    """
    Return a schema describing the SDL fields for the frontend.
    This mirrors the /api/config/schema endpoint pattern.
    """
    return {
        "description": "O-Line SDL Template Fields",
        "fields": {
            "version": {"type": "string", "description": "SDL version (always 2.0)"},
            "services": {"type": "object", "description": "Container service definitions"},
            "profiles": {"type": "object", "description": "Compute and placement profiles"},
            "endpoints": {"type": "array", "description": "Akash deployment endpoints"},
            "expose": {"type": "array", "description": "Service exposure rules"}
        },
        "phases": [
            {"id": "a", "name": "Kickoff", "description": "Snapshot + Seed + MinIO"},
            {"id": "b", "name": "Tackles", "description": "Left/Right Sentry Nodes"},
            {"id": "c", "name": "Forwards", "description": "Left/Right Validators"},
            {"id": "e", "name": "Relayer", "description": "IBC Relayer"},
            {"id": "f", "name": "Argus", "description": "Indexing Node"}
        ]
    }


# ─── Config.toml Endpoints ─────────────────────────────────────────────────────

class ConfigContent(BaseModel):
    """Config file content"""
    path: str
    raw_toml: str
    parsed: Dict[str, Any]
    exists: bool


@router.get("/api/plugins/oline-sdl/oline-config")
async def get_oline_config() -> ConfigContent:
    """Get the O-Line config.toml content."""
    if not os.path.isfile(OLINE_CONFIG_PATH):
        return ConfigContent(
            path=OLINE_CONFIG_PATH,
            raw_toml="",
            parsed={},
            exists=False
        )
    
    with open(OLINE_CONFIG_PATH, "r") as f:
        raw_toml = f.read()
    
    try:
        parsed = toml.loads(raw_toml)
    except toml.TomlDecodeError as e:
        parsed = {"_error": str(e)}
    
    return ConfigContent(
        path=OLINE_CONFIG_PATH,
        raw_toml=raw_toml,
        parsed=parsed,
        exists=True
    )


@router.put("/api/plugins/oline-sdl/oline-config")
async def update_oline_config(data: Dict[str, str]) -> Dict[str, str]:
    """Update the O-Line config.toml content."""
    if "raw_toml" not in data:
        raise HTTPException(status_code=400, detail="Missing 'raw_toml' field")
    
    raw_toml = data["raw_toml"]
    
    # Validate TOML before saving
    try:
        toml.loads(raw_toml)
    except toml.TomlDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid TOML: {e}")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(OLINE_CONFIG_PATH), exist_ok=True)
    
    with open(OLINE_CONFIG_PATH, "w") as f:
        f.write(raw_toml)
    
    return {"status": "saved", "path": OLINE_CONFIG_PATH}


@router.get("/api/plugins/oline-sdl/oline-config/fields")
async def get_config_fields() -> Dict[str, Any]:
    """
    Return field definitions for the config.toml form editor.
    Mirrors the pattern used by the config plugin.
    """
    # Read current config to get available fields
    if os.path.isfile(OLINE_CONFIG_PATH):
        with open(OLINE_CONFIG_PATH, "r") as f:
            try:
                config = toml.loads(f.read())
            except:
                config = {}
    else:
        config = {}
    
    # Define common O-Line configuration fields
    fields = {
        "chain.chain_id": {"type": "string", "label": "Chain ID", "default": "morocco-1"},
        "chain.genesis_url": {"type": "string", "label": "Genesis URL", "default": ""},
        "akash.rpc": {"type": "string", "label": "Akash RPC", "default": "https://rpc-akash.ecostake.com:443"},
        "akash.grpc": {"type": "string", "label": "Akash gRPC", "default": "https://akash.lavenderfive.com:443"},
        "akash.chain_id": {"type": "string", "label": "Akash Chain ID", "default": "akashnet-2"},
        "terp.image": {"type": "string", "label": "Terp Node Image", "default": "terpnetwork/terp-core"},
        "terp.version": {"type": "string", "label": "Terp Version", "default": "v5.1.0"},
        "terp.pruning": {"type": "string", "label": "Pruning", "default": "nothing"},
        "terp.statesync.enable": {"type": "boolean", "label": "State Sync", "default": "true"},
        "terp.statesync.rpc": {"type": "string", "label": "State Sync RPC", "default": ""},
        "terp.snapshot.enable": {"type": "boolean", "label": "Snapshots", "default": "true"},
        "terp.snapshot.url": {"type": "string", "label": "Snapshot URL", "default": ""},
        "s3.endpoint": {"type": "string", "label": "S3 Endpoint", "default": ""},
        "s3.bucket": {"type": "string", "label": "S3 Bucket", "default": ""},
        "s3.access_key": {"type": "string", "label": "S3 Access Key", "default": ""},
        "s3.secret_key": {"type": "string", "label": "S3 Secret Key", "default": "", "secret": True},
        "dns.enable": {"type": "boolean", "label": "DNS", "default": "false"},
        "dns.domain": {"type": "string", "label": "Domain", "default": ""},
        "ssh_key.name": {"type": "string", "label": "SSH Key Name", "default": "oline-parallel-key"},
    }
    
    # Extract current values from config
    values = {}
    for key, field in fields.items():
        parts = key.split(".")
        val = config
        for part in parts:
            if isinstance(val, dict) and part in val:
                val = val[part]
            else:
                val = None
                break
        if val is not None:
            values[key] = val
        else:
            values[key] = field.get("default", "")
    
    return {
        "fields": fields,
        "values": values,
        "config_exists": os.path.isfile(OLINE_CONFIG_PATH)
    }

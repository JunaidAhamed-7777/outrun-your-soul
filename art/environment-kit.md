# Environment kit (courtyard, gate, distant engine)

Original, script-authored geometry made in **Blender 5.2.2 LTS** through the pinned official Blender MCP bridge (`ahujasid/blender-mcp@febcd90`, add-on 1.8, SHA-256 verified by `art/scripts/bootstrap.py`) in a dedicated `--factory-startup` instance on `127.0.0.1:9878`. No third-party models, textures, downloads or generation services. Source file: `art/source/environment.blend`. Conventions: [ASSET_CONTRACT.md](../docs/ASSET_CONTRACT.md).

| Asset | Triangles (budget) | Materials (budget) | Bytes | Notes |
|---|---|---|---|---|
| `floor_tile` | 20 (60) | 1: cobalt | 2,208 | Chamfered flagstone, origin lower-left corner, top at y = 0 |
| `wall_block` | 64 (150) | 2: wall_body, wall_cap | 5,224 | Low (0.55 m) cobalt wall, crowned ivory coping, footprint exactly [0,1]² |
| `exit_gate` | 1,206 (2,500) | 3: ivory, gold, gold_dark | 64,772 | 2-tile ceremonial arch; hinged leaves carry halves of one ring emblem |
| `distant_engine` | 7,786 (8,000) | 4: cobalt_mist, gold, gold_dark, ivory | 400,136 | Backdrop: miniature aqueduct railway, colossal gears, misty domed station |

Hashes and full measurements live in `art/reports/<asset>.json` (`export`, `measured`, and `glb_verification` read back from the exported bytes by `node art/scripts/verify_env_glb.mjs`).

## Runtime integration notes

- **Grout:** floor tiles leave a 0.02 m gap with chamfered edges. Put a dark `cobalt_deep` plane just below the tiles (around y = -0.06) so the grout lines read; vary each tile's tone slightly (the composite uses ±14 % brightness) to avoid a flat field.
- **Walls:** instance one `wall_block` per covered tile of each integer-aligned wall rect, plus the room perimeter just outside the playable bounds. Visual footprint equals the collision rect.
- **Gate:** place the origin at the centre of the 2-tile opening in the north perimeter row (for an 8 × 12 room: sim (4, 12.5)). Open the doors by rotating `exit_gate_door_left` / `exit_gate_door_right` about their own vertical (Three.js Y) axis; their pivots sit on the hinges at x = ∓1. The pillars stand on the perimeter wall tiles beside the opening.
- **Distant engine:** recommended placement is origin at sim (room_width / 2, room_height + 3.5) and 3.1 m below the floor (`y = -3.1` in Three.js). Rotate `distant_engine_gear_a` / `_gear_b` slowly about their **local Z** axis (Three.js; Blender local Y is the axle — the discs are tilted back 30° toward the camera), in opposite directions. Slide `distant_engine_train` along X and wrap it within x ∈ [-17, 17]. Everything below the courtyard edge is hidden by the room in the game view.
- **Colour roles:** the kit uses only architecture colours (cobalt, wall_body, wall_cap, ivory, gold, gold_dark, cobalt_mist). Vermilion, amber, cyan and violet stay reserved for ribbon, warnings, soul and lanes.

## Commands

```bash
node scripts/blender-launch.mjs --port 9878 --blend environment.blend --addon <pinned addon.py>
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_floor_tile.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_wall_block.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_exit_gate.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_distant_engine.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_composite.py
node art/scripts/verify_env_glb.mjs
```

Environment helpers live in `art/scripts/oys_env.py` (separate from the shared `oys_blender.py` so parallel kits never edit the same file).

## Evidence and limits

- **Reproducibility (observed 30 Oct 2026):** two consecutive full regeneration cycles, with the composite rebuilt in between, produced byte-identical GLBs for all four assets. (Before the fix in `oys_env.clear_composites()`, composite copies kept old meshes alive and renamed regenerated meshes `.001`.)
- **Previews:** `art/previews/<asset>-game-camera.png` (Blender renders through the game-camera angle) and `art/previews/courtyard-composite-game-camera.png` (720 × 1280 phone-composition proof with actor-sized stand-in markers, not final actor art). `art/previews/environment-blender-viewport.png` is a live viewport screenshot captured through the MCP bridge.
- **Not yet verified:** Khronos glTF Validator, appearance in the actual Three.js renderer, and anything on a real phone. The composite is a Blender render, not a game screenshot.

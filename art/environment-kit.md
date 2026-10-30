# Environment kit (courtyard, gate, lanes, decor, station, distant engine)

Original, script-authored geometry made in **Blender 5.2.2 LTS** through the pinned official Blender MCP bridge (`ahujasid/blender-mcp@febcd90`, add-on 1.8, SHA-256 verified by `art/scripts/bootstrap.py`) in a dedicated `--factory-startup` instance on `127.0.0.1:9878`. No third-party models, textures, downloads or generation services. Source file: `art/source/environment.blend`. Conventions: [ASSET_CONTRACT.md](../docs/ASSET_CONTRACT.md).

| Asset | Triangles (budget) | Materials (budget) | Bytes | Notes |
|---|---|---|---|---|
| `floor_tile` | 20 (60) | 1: cobalt | 2,208 | Chamfered flagstone, origin lower-left corner, top at y = 0 |
| `wall_block` | 64 (150) | 2: wall_body, wall_cap | 5,224 | Low (0.55 m) cobalt wall, crowned ivory coping, footprint exactly [0,1]² |
| `exit_gate` | 1,206 (2,500) | 3: ivory, gold, gold_dark | 64,772 | 2-tile ceremonial arch; hinged leaves carry halves of one ring emblem |
| `distant_engine` | 7,786 (8,000) | 4: cobalt_mist, gold, gold_dark, ivory | 400,152 | Backdrop: miniature aqueduct railway, colossal gears, misty far layer |
| `lane_emitter` | 564 (600) | 3: gold, gold_dark, lane_violet | 31,364 | Replaces a perimeter wall tile; violet glass rod is the lane source |
| `threshold_inlay` | 644 (800) | 3: ivory, gold, gold_dark | 29,836 | 2 × 1 exit-zone inlay, top at 0.002 m, gate emblem + chevrons |
| `urn` | 258 (300) | 2: gold, ivory | 15,952 | Decor, nonblocking |
| `banner_post` | 326 (400) | 3: cobalt, gold, ivory | 21,348 | Decor, nonblocking; swaying pennant part |
| `lamp_post` | 206 (300) | 3: gold, gold_dark, ivory | 14,336 | Decor, nonblocking; ivory globe readable from above |
| `station_kiosk` | 1,666 (3,000) | 4: cobalt, gold, gold_dark, ivory | 88,300 | "Signal House" station; animatable bell and semaphore arm |

Hashes and full measurements live in `art/reports/<asset>.json` (`export`, `measured`, and `glb_verification` read back from the exported bytes by `node art/scripts/verify_env_glb.mjs`, including triangle/material budgets).

## Runtime integration notes

- **Grout:** floor tiles leave a 0.02 m gap with chamfered edges. Put a dark `cobalt_deep` plane just below the tiles (around y = -0.06) so the grout lines read; vary each tile's tone slightly (the composites use ±14 % brightness).
- **Walls:** instance one `wall_block` per covered tile of each integer-aligned wall rect, plus the room perimeter just outside the playable bounds. Visual footprint equals the collision rect.
- **Gate:** origin at the centre of the 2-tile opening in the north perimeter row (8 × 12 room: sim (4, 12.5)). Open the doors by rotating `exit_gate_door_left` / `exit_gate_door_right` about their own vertical (Three.js Y) axis; pivots sit on the hinges at x = ∓1.
- **Threshold inlay:** place its lower-left corner at the exit rect's min corner (8 × 12 sample: sim (3, 11)). Bottom at 0, top at 0.002 m; all regions are coplanar and non-overlapping, so it never z-fights with itself.
- **Lane emitter:** use it in place of the perimeter wall tile where a lane enters. The aperture (`lane_emitter_aperture`, front face centre at 0.2 m) faces -Y at yaw 0; rotate about the tile centre (0.5, 0.5) so it faces along the lane. For a corner-origin root that means: yaw +90° (aperture → +X, a lane entering from the west wall) puts the root one tile east of the tile's min corner. Draw the lane from the aperture; the violet rod in the open trough stays visible from the tilted camera at any yaw.
- **Decor:** nonblocking; place only outside the playable bounds or on perimeter tiles (wall tops are at 0.55 m). Lamps suit the gate sides, urns the corners, banners the east/west/north walls. Avoid tall banners on the south edge, where their height covers the bottom rows. Sway `banner_post_cloth` a few degrees about its local X (pivot on the crossbar).
- **Station kiosk:** origin at the house ground centre, faces -Y; the signal mast stands at x = +1.2. Swing `station_kiosk_bell` about local X (pivot in the belfry) when a draft choice is confirmed; lower `station_kiosk_signal_arm` by rotating about its local Z in Three.js (Blender local Y pin) by about -40° when the player departs. `art/previews/station-composite-game-camera.png` shows one composition: a 6 × 5 platform with parapet, the kiosk at (2.6, 3.0), and the distant engine at (9.4, 8.5, -3.1) so its giant gear haloes the house.
- **Distant engine:** recommended courtyard placement is origin at sim (room_width / 2, room_height + 3.5) and 3.1 m below the floor. Rotate `distant_engine_gear_a` / `_gear_b` slowly about their **local Z** axis in Three.js (discs are tilted back 30° toward the camera), in opposite directions. Slide `distant_engine_train` along X and wrap it within x ∈ [-17, 17]. The misty far layer sits behind the gears' tilted upper halves (pushed back 1.2 m and lowered by 1.2·tan 58° so its screen position is unchanged).
- **Colour roles:** architecture colours only (cobalt, wall_body, wall_cap, ivory, gold, gold_dark, cobalt_mist). The single exception is the emitter's `lane_violet` rod, which is the lane signal itself. Vermilion, amber and cyan stay reserved for ribbon, warnings and soul.

## Commands

```bash
node scripts/blender-launch.mjs --port 9878 --blend environment.blend --addon <pinned addon.py>
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_<asset>.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_composite.py
BLENDER_MCP_PORT=9878 node scripts/blender-mcp.mjs exec art/scripts/env_station_composite.py
node art/scripts/verify_env_glb.mjs
```

Generators: `env_floor_tile`, `env_wall_block`, `env_exit_gate`, `env_distant_engine`, `env_lane_emitter`, `env_threshold_inlay`, `env_urn`, `env_banner_post`, `env_lamp_post`, `env_station_kiosk`. Environment helpers live in `art/scripts/oys_env.py` (separate from the shared `oys_blender.py`, so parallel kits never edit the same file): `rect_lathe`, `arc_band`, `scale_about`, `gear`, `add_banded_lathe`, `merge_preassigned`, composite helpers (`clear_composites`, `composite_collection`, `instance_asset`, `composite_mesh`, `floor_grid`, `tone_materials`, `import_glb_composite`, `render_composite`).

## Evidence and limits

- **Reproducibility (observed 30 Oct 2026):** two consecutive full regeneration cycles of all ten assets — the second after rebuilding both composites, which import the actor GLBs — produced byte-identical GLBs. Generators clear composite-only objects first; otherwise composite copies keep old meshes alive and regenerated meshes get renamed `.001`.
- **Previews:** `art/previews/<asset>-game-camera.png` (Blender renders through the game-camera angle); `courtyard-composite-game-camera.png` and `station-composite-game-camera.png` (720 × 1280 phone-composition proofs with the real actor GLBs imported; the violet lane band in the courtyard is a composite-only stand-in for the runtime-drawn lane). `environment-blender-viewport.png` and `station-blender-viewport.png` are live viewport screenshots captured through the MCP bridge.
- **Not yet verified:** Khronos glTF Validator, appearance of the phase-2 assets in the actual Three.js renderer, and anything on a real phone. Composites are Blender renders, not game screenshots.

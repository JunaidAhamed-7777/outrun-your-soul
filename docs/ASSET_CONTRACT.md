# Asset and coordinate contract (frozen for P0)

Status: **agreed interface, 30 October 2026.** This freezes the handoff between the deterministic simulation, the Three.js renderer and Blender authoring. Changing anything here requires updating the simulation, renderer and Blender scripts together. It does not claim any asset is finished; see [ASSET_MANIFEST.md](ASSET_MANIFEST.md) for status.

## Units and axes

| Space | Ground plane | Up | "Screen up" / north | Default model forward |
|---|---|---|---|---|
| Simulation (`src/sim`) | x, y | none (2D) | +y | n/a |
| Blender authoring | X, Y | +Z | +Y | **-Y** (toward the camera) |
| glTF / Three.js runtime | X, Z | +Y | -Z | +Z |

- **One gameplay tile = one Blender metre = one Three.js unit.**
- Blender exports with the standard glTF +Y-up conversion (`export_yup=True`), which maps Blender `(x, y, z)` to Three `(x, z, -y)`.
- The renderer maps simulation `(x, y)` to Three `(x, 0, -y)` (`simToWorld` in `src/render/contract.ts`). Therefore **Blender ground XY equals simulation XY**: a room authored with tile corners at integer Blender XY coordinates lines up with simulation walls without any per-asset rotation.
- To face a simulation direction `(dx, dy)`, set the model root `rotation.y = atan2(dx, -dy)` (`yawForFacing`). A model that faces Blender -Y faces simulation -y (south, toward the camera) at yaw 0.
- Never add a corrective rotation inside an individual asset. Verify with `calibration_tile`, whose arrow points Blender +Y (simulation north, screen up).

## Pivots and footprints

- Actors (`courier_body`, `soul_mask`, `needler`, `keeper`, `warden`): origin at ground centre under the collision circle. The simulation radius is authoritative (`TUNING.bodyRadius`, enemy radii in sim); art should keep its widest silhouette within roughly 1.3x that radius so the ground ring reads as the true footprint.
- Floor and wall modules: origin at the **lower-left (min X, min Y) grid corner**, occupying `[0,1] x [0,1]` in Blender XY. Walls in room data are integer-aligned `RectDef`s; the renderer instances one wall module per covered tile.
- `exit_gate`: origin at ground centre of its opening, opening facing -Y, 2 tiles wide.
- Soul floats: its origin is still on the ground; the floating mask is a child offset in +Z, so the ground marker and collision centre stay aligned.

## Node and material naming

- Each GLB contains exactly one root node named with its asset ID (`courier_body`, `soul_mask`, ...). No lights, cameras or reference planes.
- Moving parts are child nodes named `<asset_id>_<part>` (Blender object names are global across a file, so the asset prefix keeps them unique), with pivots at the real hinge, animated procedurally at runtime (no root motion, no armature required for P0):
  - `courier_body`: `courier_body_body`, `courier_body_head`, `courier_body_mask`, `courier_body_scarf`
  - `soul_mask`: `soul_mask_mask`, `soul_mask_wisp`
  - `needler`, `keeper`: `<id>_base`, `<id>_head`, plus an empty `<id>_muzzle` socket where bolts spawn visually
  - `exit_gate`: `exit_gate_frame`, `exit_gate_door_left`, `exit_gate_door_right` (doors open around their outer hinges)
- Materials use the palette key as their name (`ivory`, `vermilion`, `cobalt`, `gold`, ...) with base colours taken from [`src/content/palette.json`](../src/content/palette.json). Principled BSDF base colour, roughness and metallic only (plus emission on the two soul materials); no procedural nodes, no image textures in P0. The renderer may tint by material name for hit flashes.

## Files

- Source: `art/source/<file>.blend` (one or a few authoring files; record which asset lives where).
- Authoring scripts: `art/scripts/*.py` (reproducible generation and export through the pinned Blender MCP bridge: `node scripts/blender-launch.mjs --port 9876 --blend <file>.blend`, then `node scripts/blender-mcp.mjs exec art/scripts/<asset>.py`). Shared helpers live in `art/scripts/oys_blender.py`.
- Reviewed exports: `public/assets/models/<asset_id>.glb` (only assets the game references ship).
- Proof: `art/previews/<asset_id>-game-camera.png`, `art/reports/<asset_id>.json` (statistics + validator result), `art/provenance.csv`.

## Runtime fallback

The renderer must run with any or all GLBs missing, substituting primitive placeholders with the same pivots and footprints. Art swaps never change simulation behaviour; a test asserts the simulation module graph does not import renderer or asset code.

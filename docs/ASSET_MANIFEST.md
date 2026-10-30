# Asset manifest and production order

Status: **all assets below are planned, none verified complete**. See [ART_PIPELINE.md](ART_PIPELINE.md) for scale, export and acceptance contracts. Working render baseline: Blender low-poly GLB assets with fixed orthographic presentation; confirm in the one-room gate before expanding.

## P0: prove one playable encounter

| Asset ID | Purpose and silhouette | Deliverable | Acceptance |
| --- | --- | --- | --- |
| `calibration_tile` | One-unit grid tile plus asymmetric forward marker | Disposable GLB test fixture | Correct scale/axes in game; exclude from release |
| `courier_body` | Compact ivory masked figure, physical feet, vermilion scarf accent | Source + GLB, idle/dash/recovery poses | Ground center matches collider; body remains visible at final phone size |
| `soul_mask` | Floating pale/cobalt form with a distinct open shape, not a second identical courier | Source + GLB, gentle idle pulse | Identifiable muted/grayscale and at overlap; no opaque glow hiding incoming bolts |
| `needler` | Narrow sentry with unmistakable muzzle/direction | Source + GLB, anticipation/fire/recovery | Art matches locked attack direction; projectile originates at documented socket |
| `courtyard_kit` | Cobalt floor, low wall, inner/outer corner, unobstructed doorway | One source kit, named export nodes | Exact grid anchors, no visual/collision disagreement |
| `exit_gate` | Ivory/gold paired opening requiring both selves | Source + GLB, inactive/ready/open states | State readable without text; no closing across active tether |
| `runtime_cues` | Vermilion tether, dash/return previews, bolt, amber warning, hit feedback | Runtime graphics, not baked Blender mesh | Live simulation source; cuttable bolt distinct from persistent lane |

Do not wait for final models before building the encounter. Temporary primitives must have the same anchors and interface so art swaps do not rewrite rules.

## P1: complete the small coherent game

| Asset ID | Purpose | Reuse plan |
| --- | --- | --- |
| `keeper` | Soul-targeting enemy; broad suspended lantern silhouette | Reuse sentry base only if target-role identity remains immediate |
| `warden` | Frontal guard with visible exposed side/core | One mesh/state family supports ordinary and final encounter remix |
| `persistent_lane` | Environmental hazard with clear active/inactive cycle | Runtime stripe/pattern geometry; distinct from projectiles |
| `courtyard_dress` | Two or three nonblocking urn/banner/rail details | Instance a small shared family; never random collision |
| `distant_funeral_engine` | Gold machinery/procession outside playable bounds | One low-detail silhouette composition or baked background |
| `relic_symbols` | Six recognizable rule symbols | Prefer clean 2D SVG/atlas: Needlesong, Glass Lantern, Long Silk, Short Stitch, Mourning Bell, Traveler's Knot |
| `relic_effects` | Soul-speed cue, halo, earned charge, reunion burst, decoy | Runtime state-driven effects; no phantom gameplay claims |
| `end_state` | Escaped pair / failed courier composition | Reuse characters and gate, not a separate cinematic production |

Room content target is a **pool of six validated templates**, not six unique environmental art kits. Alter routes, cover and threat schedules with the same kit. Six relics and two equipped slots are systems work, not a request for six complex 3D collectibles.

## P2: only after release-critical gates

Additional costume silhouettes, secondary ambient motion, richer skyline, alternate masks and optional particle layers. Cut these before cutting input clarity, readable previews, audio controls, save/continue, the tutorial, or device QA. No elaborate cloth, full humanoid rig, destructible architecture or new biome is required.

## File layout

Suggested production paths (create when implementation begins):

- `art/source/<asset-id>.blend`: editable original source.
- `art/exports/<asset-id>.glb`: reviewed export before application integration.
- `art/previews/<asset-id>-game-camera.png`: actual export/game-camera proof, clearly labeled.
- `art/reports/<asset-id>.json`: validator/statistics report.
- `public/assets/models/`: only runtime models actually referenced by the application.
- `public/assets/textures/`, `public/assets/audio/`: packaged runtime media.
- `art/provenance.csv`: source and rights ledger.

Do not ship `.blend`, unused high-resolution references, backup files, API credentials, model-service logs or validation reports in the browser ZIP. Avoid duplicate runtime copies. Large editable sources may need separately approved storage/LFS; do not silently add paid storage or unbounded binaries.

## Record per completed asset

Maintain these columns in the actual ledger, with `planned`, `blocked`, `exported`, `validated`, `phone-tested` as distinct statuses:

`asset_id, status, author, created_at, source_url_or_original, license, redistribution_checked, required_credit, ai_tools_used, blender_version, exporter_version, source_path, export_path, export_sha256, exported_triangles, materials, texture_dimensions, file_bytes, animation_clips, validator_errors, warning_disposition, browser_build_commit, device_test, owner, next_action`

An original asset can use `original` for its source, but still needs a clear creator and permission record. A successful export alone cannot become `phone-tested`. Mark unknown values `not measured`, never zero.

## First delivery packet for the art agent

Deliver the courier, soul, needler and courtyard together with source files, GLBs, thumbnails from the agreed camera, metadata, and validator results. Include one browser screenshot at portrait phone dimensions showing body, soul, ribbon, telegraph and wall at once. Check both separated and reunion states. Report what remains untested on real hardware.

The gameplay agent owns collision and timing. The art agent owns model geometry, visual states and export correctness. Changes to radii, wall bounds, input thresholds or attack timing require a gameplay review, not an artistic adjustment disguised as a model replacement.

## Reference boundary

The art direction is original project design. Concept images are reference studies, not completed game screenshots. Do not copy finalist art, copyrighted characters or an artist's specific assets. Verify each external texture/font/sound/model license before including it in this public repository. Blender MCP is a tool, not a blanket asset license.

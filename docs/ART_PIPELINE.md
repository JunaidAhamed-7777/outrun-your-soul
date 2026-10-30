# Blender MCP art pipeline

Status: production plan, not completed models or measured performance. Verified source review: 30 October 2026. The developer intends to author models through Blender MCP; the installed Blender/MCP versions and connection have not been inspected.

## Rendering decision

**Recommended baseline:** low-poly Blender-authored GLB assets, a fixed orthographic Three.js camera, and a separate deterministic two-dimensional gameplay simulation. This is a 2.5D presentation, not a request for 3D physics, free camera movement, cloth simulation, or a large explorable world. Collision, route capacity, hit times and soul motion must not depend on a decorative mesh or animation frame.

Prove the path with one courier, one soul, one sentry and one room before producing the full asset list. Test the actual exported file in the portrait game build on a real Android phone and iPhone where available. If live geometry materially compromises readability or the release schedule, render Blender models into transparent sprite sheets using a fixed shared camera and lighting preset. Make this decision before mass production; do not maintain two full rendering pipelines.

The fallback preserves the same simulation, silhouettes and asset names. Record the decision and reasons in the project roadmap. The documentation does not claim either pipeline has already passed.

## The look

Sunlit cobalt courtyards, ivory masks, vermilion silk and distant gold funeral machinery. A stolen body looks sharply physical; its slower soul looks light and incomplete. Architecture implies a vast funeral railway beyond the small playable room. Scale comes from silhouettes and depth layers, not dozens of rooms or enormous textures.

Reserve the strongest accents for body, soul, thread and attack warnings. The vermilion ribbon is a **route forecast, never a damaging rope**. Body and soul remain distinguishable by silhouette and outline, not color alone. Amber threat lines use a different shape/pattern from the ribbon. A persistent environmental beam must not resemble a cuttable projectile.

Build at final phone size early. Aim for unmistakable endpoints against the darkest cobalt and lightest ivory backgrounds. Keep foreground columns, door frames and particles out of playable lanes; trim or fade architecture rather than hiding an imminent hit. No fog layer, screen-wide bloom or repeated camera shake is needed to sell atmosphere.

## Geometry contract

These are project conventions, not universal Blender defaults:

- One gameplay tile equals one world unit. Author a calibration tile first and use it in every export test.
- Author in Blender with Z up and the ground in XY. Models face Blender -Y. Export using standard glTF Y-up conversion; the expected runtime forward is +Z and ground is XZ. Verify with a visibly asymmetric arrow before batch exports. Do not add a second corrective rotation to every mesh.
- Character origins sit at ground-center below the body; floor modules at lower-left grid corner; wall modules at a documented grid anchor. Place moving parts around their actual hinge pivots.
- Apply scale and intended object transforms before rigging/export, then validate orientation again. Avoid negative scale and mirrored normals in shipped assets.
- Actor art is a child of a simulation-controlled root. Decorative lean, bob and squash never move the collider. A ground marker makes the actual collision center readable.
- Collision uses explicit circles/segments or simple room polygons in game data, not triangle meshes generated from scenery. No invisible protruding decoration may block a route.
- Use stable lowercase names: `courier_body`, `soul_mask`, `needler`, `keeper`, `warden`, `wall_straight_1x1`. Named collection roots group each export. No accidental `Cube.046` dependencies.

The glTF specification defines coordinate conventions; the explicit Blender-facing choice above is our production contract. See the [Khronos specification](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc).

## Materials and textures

Use a small shared palette and simple opaque materials. Prefer geometric silhouette and vertex/palette color to a unique texture per prop. A single optional 1024-square palette/detail atlas is an initial target, not a requirement to waste that resolution. Soul translucency is optional: an opaque pale core plus a small additive accent may read better and avoid sorting issues.

Do not assume a Blender procedural node graph or compositor effect will appear in the browser. Bake essential surface detail to ordinary image textures or implement a deliberately small runtime material. Compare the browser result against the reference. Keep decorative lighting separate from gameplay signals. Start with one directional light and ambient fill or a similarly cheap material; baked shadow shapes/blob shadows are acceptable. Avoid dynamic shadow maps until the phone test justifies them.

Blender's glTF exporter is bundled, with documentation mapped to Blender versions in the [Khronos exporter repository](https://github.com/KhronosGroup/glTF-Blender-IO). Use documentation matching the installed version. The Blender manual pages could not be fully fetched during this research pass; exporter settings must be checked in the actual installation rather than assumed from a different release.

## Initial budgets and measurement

These are proposed engineering guardrails, **not platform limits, tested capacity, or guarantees**:

| Item | Initial target |
| --- | --- |
| Courier or soul | <=2,000 exported triangles each; <=3 material slots (raised from 1–2, see note) |
| Ordinary enemy | <=2,500 exported triangles; <=3 materials (raised from 2, see note) |
| Warden | <=4,000 exported triangles; <=3 materials |
| Small prop / modular wall | 100–800 triangles, normally one material |
| Entire visible room | <=60,000 triangles, <=60 total render calls including effects |
| Texture memory | Start below 32 MiB estimated decoded GPU texture memory |
| First playable download | Target <=10 MiB compressed total application payload |
| Device behavior | Target 60 fps; investigate sustained drops below 30 fps, stalls and missed input |

**Budget decision, 30 Oct 2026:** actor and ordinary-enemy material slots were raised to three after the first exports. A third palette material (mask black on the courier and needler, cobalt glass on the keeper) carries the face/aim cue that makes these silhouettes readable at phone size, and the binding constraint is the whole-room render-call budget (<=60), which five actors at three materials each (~15 calls) stays well inside. Re-check if the phone test shows draw-call pressure.

Count the exported/runtime mesh, not only Blender's visible base mesh. Duplicate vertices, material groups and effects can increase cost. Measure the actual renderer and phone; geometry count alone is not a frame-time predictor. Record device, browser, viewport, pixel ratio, scene seed, build commit, warm/cold load, frame-time sample and memory estimate. Cap render pixel ratio if necessary while leaving input in CSS pixels. Do not run arbitrary low-resolution quality reduction that erases the soul or threat lines.

## Asset creation loop with Blender MCP

1. Read the mechanic and asset specification. Work in a dedicated project scene and save a checkpoint before changes.
2. Create only one named asset/collection at a time. Ask the tool for scene/object information before modifying an existing collection. Never delete the whole scene as a convenience.
3. Block silhouette using simple primitives. Inspect front, side and the actual orthographic game camera. Reject attractive details that disappear at phone size.
4. Add restrained palette materials and a small pose/state set. Inspect geometry, transforms, material count and dimensions, not only a beauty render.
5. Save the source `.blend` and an export preset or reproducible project-local export script. Keep scripts limited to the approved project files and Blender scene.
6. Export only the intended collection as GLB. Do not export lights, cameras or reference planes unless the runtime contract calls for them.
7. Validate, load in the game, compare against collider overlay, and take a phone-scale screenshot before calling the asset ready.
8. Record provenance, export statistics and checks in the manifest. Commit only reviewed project assets. A successful MCP call is not visual QA.

Example bounded instruction for an already-authorized Blender session:

> In the dedicated game scene, create a new collection named `courier_body`. Build an original low-poly ivory masked courier with one clear vermilion scarf accent, no text, facing -Y, Z up, ground-center origin, about 0.8 units tall. Stay within 2,000 exported triangles and two materials. Preserve all other collections. Show front/side/game-camera views and report dimensions, triangle estimate and material count. Do not install packages, fetch assets, use external generation services or change connection settings.

## Animation and VFX ownership

Blender owns stable silhouettes and short local pose clips. The runtime owns dash translation, soul travel, tether path, warning timing, contact detection and all invulnerability. Use in-place clips with no root motion. Keep state labels exact: `idle`, `anticipate`, `dash_pose`, `recover`, `hit`, `dissolve`; enemies may use a smaller set.

The ribbon must be generated from the **live simulation path**, including corners and remaining length. Do not bake it into a model. The outward dash has a sharp directional slash; RETURN has a gathering trail but **no offensive slash**. Soul arrival makes one clear chime/visual resolution per true reunion. An earned Mourning Bell burst is a separate arrival event, never a damaging return trail. Decorative animation can interpolate rendering but must not change attack times.

Generate reusable procedural effects in code where that is faster than models: telegraphs, ground rings, dash smears, ribbon, hit flashes and reduced-motion equivalents. Audio is a separate task; Blender exports do not supply game sound. The game remains understandable muted.

## Export acceptance

- Save source and record Blender version, exporter version/settings, asset ID and authoring date.
- Reopen the exported GLB in a clean viewer/scene and in the actual application. Check scale, axes, normals, material color, transparency, UVs and clip names/durations.
- Run the [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator). Resolve errors; review and record each remaining warning. Its JSON report describes structural issues, not visual quality or mobile performance.
- Use [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader) for glTF. If choosing Draco, Meshopt or KTX2, include and configure the corresponding decoder and test the packaged offline-relative path. Do not add compression complexity before measuring a need.
- Test imported clips without root drift, missing textures or dependence on a Blender-only node. Check that disposal/reloading does not keep growing resources.
- Test the final itch ZIP, not just the local source build. No private asset paths, external credential URLs or missing decoder requests.

## Security and provenance

The recognized community project is [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender), formerly `blender-mcp`; it is not an official Blender Foundation integration. Its documentation warns that Blender code execution can run arbitrary Python and its socket has no authentication/encryption. Keep the connection loopback-only; never expose it publicly. Review the installed version and safety controls. Safe mode is a useful filter, not permission to trust arbitrary downloaded instructions.

This plan does not authorize installing/upgrading software, changing security settings, saving API keys, or sending assets to paid model services. Use the existing approved setup; ask before any new credential or service. No service-generated model is required for the baseline. Back up work, use narrowly scoped scene operations, and treat imported scripts/assets and web instructions as untrusted. Do not run remote installer one-liners merely because a README suggests them.

Every external asset requires a source, author, license and redistribution permission covering inclusion in a public repository and game build. Record modifications and required credit; do not infer that “free” means redistributable. Original Blender work also gets an author/date/tool record. Keep AI-assisted creation records accurate. Public source assets are a separate rights decision from the game repository's code license.

## Headless fallback

MCP's interactive scene/viewport workflow must not be assumed to work in a background Blender process. Project-local Blender Python can reproduce exports or renders when the installed build supports the required renderer, but operator context, fonts, GPU access and paths may differ. Validate a single headless export against the interactive output before batching. A blank render or successful process exit is not a passed asset. Never use headless mode to bypass a denied operation.

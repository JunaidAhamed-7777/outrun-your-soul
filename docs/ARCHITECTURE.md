# Technical architecture

Status: proposed implementation contract, 30 October 2026. No runtime or performance result exists yet.

## Baseline choice
Use TypeScript, Vite and Three.js for a static HTML5 build. Render a low-poly orthographic scene from Blender GLB assets, with combat defined entirely on a deterministic two-dimensional ground plane. Do not add a physics engine or derive collisions from decorative meshes. A lightweight HTML overlay may handle menus/settings; do not put the simulation in framework render state.

The first real-phone asset/encounter test is a renderer decision gate. If live 3D cannot meet readability, loading or frame pacing goals quickly, use Blender-rendered sprites with the same simulation. This is an early production fallback, not a promise of two maintained renderers. Pin tested dependency versions and commit the lockfile when implementation starts.

## Proposed layout
- src/sim/: state, commands, fixed-step clock, route deque, collision, enemies, relics, room rules, seeded random generator.
- src/input/: pointer gesture state machine, projection to ground plane, cancellation and one-action buffer.
- src/render/: camera, GLB loading/cache, actor views, ribbon/preview, visual effects and disposal.
- src/audio/: gesture-unlocked audio, event sounds, mute and visibility lifecycle.
- src/ui/: title, tutorial hints, health/thread display, loadout, route choice, pause, results and settings.
- src/content/: validated room, enemy and relic data with stable IDs.
- src/save/: versioned room-entry checkpoint, progression and settings.
- tests/: deterministic simulation fixtures, property/invariant tests, input and save tests.
- public/assets/: optimized runtime art/audio only; separate editable Blender sources from the shipped ZIP.

Names are intended organization, not existing files. Define dev/build/preview/typecheck/test scripts when bootstrapping and document the actual commands.

## Simulation contract
Use a fixed simulation timestep with bounded catch-up and explicit pause. Keep render interpolation separate. Commands carry simulation ticks and stable entity IDs. Use one seeded PRNG whose state is saved; never use frame count or wall-clock randomness for combat. A renderer subscribes to simulation snapshots/events and cannot decide whether a hit occurred.

Use a segment deque for the living tether. Body appends during outward movement; soul consumes from head. RETURN consumes from tail while soul still consumes from head. Maintain total arc length and a vertex cap; simplification may never cut through a wall. Actual endpoint contact after separation is a reunion event that clears the route and stops outward movement. Never use a fixed-time replay queue as a substitute.

Within a step, process swept event times rather than letting update order decide outcomes. Split at movement, wall, projectile cut, hit, halo boundary and reunion events as necessary. Define deterministic exact-tie priorities consistent with COMBAT_SPEC and test them. One attack activation ID cannot hit both endpoints repeatedly. Global grace and damage accounting live in simulation, not animation callbacks.

## Renderer and asset adapter
Simulation positions are ground-plane coordinates. Choose and document one mapping into Three.js (recommended ground X/Z, vertical Y); Blender export conversion must be handled once, not manually rotated differently per asset. Ground anchors and authored collision footprints are explicit. Camera projection converts touch preview vectors to gameplay coordinates. Rendered perspective cannot change collision ranges.

Models provide presentation: idle, dash/recovery, warning, hurt and defeat poses where useful. Gameplay timings come from simulation. Animation completion never grants invulnerability or opens a gate. Bright hit markers, forecast ribbon, current danger and future attack warnings must remain distinguishable without bloom or audio. Keep touch targets in CSS pixels and test device pixel ratio independently of world coordinates.

## Save and interruption
Write a versioned checkpoint at room entry after prior room rewards and route choice are committed. Include seed/RNG state, room ID, loadout, health and progression needed to replay that entry. Within the room, page reload or browser-process loss restores that saved entry; it must not duplicate rewards or reroll a draft. Backgrounding while the process and in-memory state remain alive only pauses the current state and later resumes it explicitly; it does not restart the room. Save settings/progression separately where appropriate. Validate loaded data and handle absent/corrupt/quota-blocked storage without crash. Tell players when saving is unavailable. Browser storage can be cleared; do not promise cloud persistence.

On visibility loss, focus loss or pointer cancellation: discard gesture/buffer, pause all gameplay clocks and suspend/resume audio safely. Resume behind an intentional player action rather than delivering accumulated damage. See TEST_PLAN for actual acceptance cases.

## Run layer
`src/run/` is pure, DOM-free run logic; `src/save/checkpoint.ts` and `src/save/storage.ts` persist it. Implemented 30 October 2026 with automated tests only (no device evidence).
- `relics.ts`: the six relic records, two-slot legality (fourteen legal pairs; Long Silk + Short Stitch rejected), drafts that fill the free slot or replace by explicit index, `roomParamsFor` (reach relics change capacity/soul speed) and `simHooksFor` (provisional data for Needlesong, Glass Lantern, Mourning Bell and Traveler's Knot that the simulation must read instead of hard-coding).
- `expedition.ts`: seeded graph opening (Departure Court) → branch pair → station (first draft) → branch pair → station (keep-or-replace) → final approach (Last Platform) → boss → ending. Four regular encounters per run from the six-template pool; templates are referenced by string ID only. The second station is an addition that gives the documented keep-or-replace choice a place in a single run; validate pacing before treating it as final. Run RNG is stateless by label (`hashSeed(seed, label)`), so the seed is the full run-RNG state; draft offers are fixed when a station is entered. All transitions return new objects; repeated completions and draft commits are no-ops.
- `checkpoint.ts`: versioned checkpoint at safe boundaries (node entry, after a completion, after a station choice). The graph is regenerated from the seed and compared by fingerprint; recorded drafts are replayed to prove offers and loadout. Two alternating storage slots keep the previous valid save until the new one is read back. `commitRoomCompletion` makes completion + reward + checkpoint one idempotent step. Player label: "Continue restarts this room."
- `progress.ts`: bounded run records and a discovery atlas; a run that reached a station laterally unlocks the Long Reach starter. Updates are exactly-once per run ID.

## Delivery and dependency boundaries
A static itch build must work without a server API, secrets or runtime external generation. Bundle dependencies and assets. Set Vite relative base (for example './') and construct runtime asset URLs using the tested base convention; do not hardcode site-root '/assets' paths. Check the final ZIP under a nested URL and itch iframe, not only localhost root.

Current Three.js WebGLRenderer requires WebGL2; detect renderer support and show a readable failure rather than a blank canvas. WebGL context loss must stop play safely. Do not bypass browser security or silently claim unsupported devices passed. Rendering budgets and fallback gate are in ART_PIPELINE.

## Primary documentation
- [Vite production builds and relative base](https://vite.dev/guide/build)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)
- [itch HTML5 requirements](https://itch.io/docs/creators/html5)

These are tooling references, not evidence that this game's implementation has passed them.

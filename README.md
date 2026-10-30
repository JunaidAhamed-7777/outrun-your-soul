# OUTRUN YOUR SOUL

**Your body can outrun death. Your soul cannot.**

A dead courier steals their body back from a funeral railway. Dash through sunlit courtyards while a slower, vulnerable soul follows the living route you leave behind. Every attack commits a future position for your soul. Every reunion is a choice.

A mobile-portrait, touch-first action roguelite for [Slapjam #2](https://itch.io/jam/slapjam-ai-2), theme **Speed**. Planned art direction: cobalt stone, ivory masks, vermilion thread and distant golden funeral machinery, with Blender-authored models.

## Status

**Documentation and implementation handoff only. No playable build, models, measured performance or verified submission yet.** This is the public implementation repository. The documents distinguish design targets from tested results. Registration, project publishing and jam submission are separate states.

Official deadline: **31 October 2026, 15:00 UTC / 20:30 IST**. Internal submission target: **12:00 UTC / 17:30 IST** that day. No post-deadline build fixes under the current jam rules. See the sourced submission guide before publishing.

## Start here

Give your implementation agent this assignment:

> Read AGENTS.md and the linked documents. Follow ROADMAP.md from the current repository state. First prove one polished touch encounter and the Blender-to-browser asset pipeline on a real phone. Preserve the combat rules, record test evidence, and expand only after the gates pass. Do not claim a feature or submission exists before verifying it.

- [Agent instructions](AGENTS.md)
- [Roadmap and acceptance gates](docs/ROADMAP.md)
- [Game vision and play loop](docs/GAME_DESIGN.md)
- [Authoritative combat rules](docs/COMBAT_SPEC.md)
- [Rooms, enemies, relics and replay depth](docs/CONTENT.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Blender MCP art pipeline](docs/ART_PIPELINE.md)
- [Asset manifest and priorities](docs/ASSET_MANIFEST.md)
- [Testing and evidence plan](docs/TEST_PLAN.md)
- [itch.io publishing and Slapjam submission](docs/SUBMISSION.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Category goals and delivery status](docs/QUALITY_AND_STATUS.md)

## Scope that protects the idea

The jam target is three enemy roles, six authored room templates used as a branching pool, one warden encounter, six relics with two equipped slots, two starting sidegrades, and room-entry checkpoints. Repeat play should change routes and target priorities, not simply increase health or grind requirements. A 10–15-minute expedition and play across later sessions are targets to test, not measured promises.

The foundation is a deterministic 2D combat simulation with an orthographic Three.js presentation. Blender creates visual assets; it does not determine collision or damage. Renderer feasibility is tested early, with a prerendered-sprite fallback before mass asset production. No runtime AI API, account system or paid backend is needed.

## Development commands

Requires Node.js (developed with v26.8.1) and npm. Dependencies are pinned to exact versions in `package-lock.json` (TypeScript 7.0.2, Vite 8.3.5, Vitest 5.0.5, Three.js 0.187.0; release tooling uses fflate 0.8.3, the Khronos glTF Validator 2.0.0-dev.3.10 and playwright-core 1.64.1).

| Command | What it does |
|---|---|
| `npm ci` | Install the exact locked dependencies. |
| `npm run dev` | Vite dev server (also on the LAN via `--host`, for phone testing on the same network). |
| `npm test` | Vitest unit tests (simulation, tooling). `npm run test:watch` re-runs on change. |
| `npm run typecheck` | `tsc --noEmit` over `src/`, `tests/` and the Vite config. |
| `npm run build` | Typecheck, then production build into `dist/` with a relative base (`./`) for itch.io's nested iframe URL. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm run package` | Build, check `dist/` against itch.io's HTML5 ZIP rules and project policy, then write a deterministic `release/outrun-your-soul-<version>-<shortsha>.zip` (`-dirty` suffix if the working tree has uncommitted changes) plus a `.json` manifest; prints the ZIP name, byte size and SHA-256. |
| `npm run check:nested` | Serve `dist/` (or `-- --zip release/<name>.zip`, or `-- --zip latest`) under an itch-like nested, case-sensitive path inside a cross-origin iframe and crawl every reference; fails on any non-200. `-- --serve` keeps it running so the printed embed URL can be opened in a browser. |
| `npm run check:models` | Validate `public/assets/models/*.glb` (shipping) and `art/exports/*.glb` (fixtures, never shipped) with the Khronos glTF Validator plus the asset-contract and budget checks; writes `art/reports/models-validation.json`. |
| `npm run verify` | Typecheck, tests, build, package, model validation and the nested crawl of the exact new ZIP, with a summary. |
| `npm run e2e` | Build, serve under the nested itch-like path, and drive an **already installed** Edge or Chrome (pinned playwright-core; it never downloads a browser) at 375x812, DPR 2, touch: production-URL checks, a real touch drag dash and tap RETURN, pause on hidden/blur, and a scripted Departure Court clear to the result panel. Writes `art/previews/e2e-*.png` and `art/reports/e2e-report-<browser>.json`. Options: `-- --zip release/<name>.zip` (test the exact upload), `-- --no-build`, `-- --browser chrome`, `-- --headed`. Exit 2 means no system browser was found. Its numbers come from a desktop browser and are not phone evidence. |

These are automated checks only. They do not replace real-phone testing or testing the uploaded itch.io page; record those in [docs/EVIDENCE.md](docs/EVIDENCE.md).

## Rights and credits

No open-source license has been selected. Public visibility alone does not grant a blanket reuse license. Keep third-party licenses and attribution with their assets. Credit AI-assisted work accurately according to the platform and jam rules. Do not commit private prize-contact answers, credentials or correspondence.

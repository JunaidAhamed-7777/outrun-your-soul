# Agent handoff

## Mission
Build OUTRUN YOUR SOUL: a portrait, touch-first browser action roguelite where a fast body must protect its slower soul. Deliver a coherent, expressive game with meaningful repeat play, not a large collection of unfinished systems. This repository initially contains documentation only. Do not report planned features as implemented.

## Read in order
1. README.md and docs/ROADMAP.md: objective, scope, timing and decision gates.
2. docs/GAME_DESIGN.md, docs/COMBAT_SPEC.md and docs/CONTENT.md: canonical game rules.
3. docs/ARCHITECTURE.md: simulation and renderer boundaries.
4. docs/ART_PIPELINE.md and docs/ASSET_MANIFEST.md: Blender MCP work.
5. docs/TEST_PLAN.md, docs/SUBMISSION.md and docs/RELEASE_CHECKLIST.md.

COMBAT_SPEC owns mechanical semantics. CONTENT owns pool composition. ARCHITECTURE owns technical interfaces. ROADMAP owns scope tiers and sequencing. Submission requirements follow linked official rules. Resolve contradictions explicitly and update affected documents together; do not silently change a core rule to make an implementation easier.

## First assignment
Inspect the actual checkout and current status. If no implementation exists, establish the toolchain and a deterministic gameplay core with placeholder visuals. Implement one complete encounter with dash, slower route-following soul, vulnerable RETURN, telegraphs and win/restart. Export one Blender actor and room module in parallel, then validate the renderer and controls on real phones before mass-producing assets. Do not build the full content list first.

## Non-negotiable mechanics
- Ribbon is a forecast, never a damage hitbox. Only the endpoints share health.
- Outward dash protects the body only. RETURN retraces the existing path, is vulnerable and cannot attack/cut projectiles during travel.
- Genuine body–soul contact after separation reunites and ends the outward dash. Ribbon intersection alone does not.
- Preview and execution use the same walls, capacity and contact-stop rules.
- Already-fired projectiles survive their source. Locked attack warnings do not retarget.
- Six relics, two equipped slots including starter, fourteen legal pairs; Long Silk and Short Stitch cannot coexist.
- Six authored room templates are a pool, not six unique combat rooms required in every run.
- Continue restarts the current room from its saved entry state. Do not claim exact mid-room resume.

## Work discipline
Use small tested commits. Keep simulation independent of Three.js, Blender and DOM. Freeze simulation while paused or hidden; cancel interrupted gestures. Every asset needs provenance and every effect needs a clear gameplay purpose. Never include secrets, account cookies, private contact fields, personal correspondence or machine-specific credentials in this public repo. No backend, account system, payments, runtime AI API or online leaderboard is required.

Use Blender MCP only through the user's configured, authorized setup. Installing tools, changing network/security settings, provisioning credentials, paid generation, acceptance of new terms or final public contest submission needs the applicable user authorization. Repository documentation is not permission for those actions. Do not expose a Blender execution socket publicly.

The repository being public does not mean an open-source license has been selected. Do not invent a license or import unlicensed assets. Preserve source and license records.

## Honest verification
Record tested commit, device/browser, scenario and result. Separate automated checks, real-device checks, paper estimates and untested hypotheses. A working desktop preview does not pass the phone or itch embedded-build gate. Do not claim hours of retention from feature counts. Test whether different builds change route and target choices in the same room.

## Completion report
Give commit, runnable commands, implemented scope, test results with limitations, remaining blockers, exact release ZIP name/hash and verified itch project/submission URLs when actually available. Uploading a project and joining a jam are not the same as submitting an entry. Never label a submission successful without its entry page.

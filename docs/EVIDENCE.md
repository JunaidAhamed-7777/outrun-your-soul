# Evidence log

Status: **updated 30 October 2026, 16:00 UTC.** Automated (layer A) and emulated-browser (layer B) results below are actual runs. **No real phone, no itch.io upload and no fresh human player has been tested: every layer C row and every decision-gate row is BLOCKED or NOT RUN.** This log follows [TEST_PLAN.md](TEST_PLAN.md) section 1 and [QUALITY_AND_STATUS.md](QUALITY_AND_STATUS.md). A row changes only when someone runs the check and writes down the evidence; feature counts, paper traces and desktop previews never fill a phone or itch.io row.

## How to record

- **Status:** `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`. BLOCKED names the missing device, access or build (for example "BLOCKED — no iPhone available").
- **Build:** the ZIP name from `npm run package` (it embeds version and short commit; a `-dirty` suffix means uncommitted changes and is never a release build) plus its SHA-256 from the printed output or `release/<name>.json`.
- **Commit:** full SHA. **Rules version:** `RULES_VERSION` / `state.rulesVersion` from the simulation.
- **Where:** for automated rows, the command; for emulated rows, browser + version + emulated viewport/DPR; for real devices, device model, OS version, browser + version, and whether it was the direct build or the itch.io embed.
- **Evidence:** command output excerpt, screenshot/clip path, or a short factual observation. No ratings or "looks good".
- Severity for failures uses TEST_PLAN: **P0** cannot load/play/finish/retry or corrupts progress; **P1** wrong damage/immunity, unreliable touch, misleading preview/telegraph, unacceptable phone performance; **P2** nonblocking.

Three evidence layers are kept separate below. **Only layer C can pass a phone or itch.io gate.**

| Layer | What it proves | What it cannot prove |
|---|---|---|
| A. Automated | Deterministic rules, invariants, package structure, relative URLs, model structure | Feel, readability, touch reliability, performance, the real upload |
| B. Emulated browser | Layout at phone viewport sizes, rendering, pointer logic with emulated touch/mouse | Real touch hardware, mobile GPU/thermals, iOS Safari quirks, itch.io iframe |
| C. Real device / real host | Phone touch, performance, audio unlock, lifecycle, the actual itch.io page | Nothing is assumed beyond the exact device, browser and build listed |

## Build record

| Build (ZIP name) | SHA-256 | Commit | Rules version | Command | Date (UTC) | Notes |
|---|---|---|---|---|---|---|
| `outrun-your-soul-0.1.0-a2d9668.zip` | `89dd5d619dd19a1b0a48033e022eb4022e32c0a48c641c8b582d3469088869d7` | `a2d96685436647be8e3143b45600642b2a1105c5` (QA branch; `src/`, `public/`, `index.html`, Vite/TS config identical to main `bdcfb65`: expedition flow, all room templates authored, iris room transitions, Signal House station scene) | 1 | `npm run verify` | 2026-10-30 ~15:45 | 507,788 bytes; 19 files, 2,046,713 bytes extracted; clean tree. **Current build for all rows below unless stated.** Not uploaded anywhere. |
| `outrun-your-soul-0.1.0-2dd1e69.zip` | `77a36d99110b09aa0bf9bcac13491adf5b6519e7435d7949dc9989c5810ad48f` | `2dd1e69f4c664d74fe4623ac343ea7cbbcb87587` (shipped source identical to main `776b8c8`: single-room Departure Court build) | 1 | `npm run verify` | 2026-10-30 ~15:25 | Superseded. 432,263 bytes; 13 files. The same bytes were produced from `9cadc30` (same shipped source): packaging is deterministic. |

## A. Automated checks

All rows: Windows 11, Node v26.8.1, build `outrun-your-soul-0.1.0-a2d9668.zip`, 2026-10-30.

| ID | Check | Command | Result | Evidence | Status |
|---|---|---|---|---|---|
| AUTO-01 | Typecheck | `npm run typecheck` | 0 errors | `npm run verify` summary | PASS |
| AUTO-02 | Unit + simulation tests | `npm test` | 515/515 tests in 54 files | Vitest JSON reporter | PASS |
| AUTO-03 | Production build | `npm run build` | Built `dist/` with relative base | verify summary | PASS |
| AUTO-04 | itch.io package rules (index.html at root, relative URLs, limits, names) | `npm run package` | 0 errors, 0 warnings; 19/1000 files | ZIP name/bytes/SHA-256 above; `release/outrun-your-soul-0.1.0-a2d9668.json` | PASS |
| AUTO-05 | Nested itch-style iframe crawl of the exact ZIP | `node scripts/check-nested.mjs --zip release/outrun-your-soul-0.1.0-a2d9668.zip` | 2 crawled + 17 direct requests, all HTTP 200 under `/html/1234567/` | verify output | PASS |
| AUTO-06 | Model validation (Khronos + contract + budgets) | `npm run check:models` | 18 GLBs (17 shipping, 20,658 triangles in total, + `calibration_tile` fixture): 0 Khronos errors or warnings, 0 contract errors. Review warnings: small props over "normally one material" (`banner_post` 3, `lamp_post` 3, `lane_emitter` 3, `threshold_inlay` 3, `urn` 2, `wall_block` 2); `last_warden_body` / `last_warden_heart` 4 materials vs the Warden row's 3 (no boss row in ART_PIPELINE); `exit_gate` width 2.88 vs 2-tile opening; `needler` half-extent 0.71 > 1.3x radius (0.55). Khronos infos: keeper, lane_emitter, needler, warden 1 each | `art/reports/models-validation.json` | PASS |
| AUTO-07 | Simulation never imports renderer/DOM/wall clock | `npm test` (`tests/boundaries.test.ts`, `tests/run/fuzz.test.ts` boundaries) | pass | Vitest | PASS |

### COMBAT_SPEC mandatory acceptance cases

Source: [COMBAT_SPEC.md](COMBAT_SPEC.md) "Mandatory acceptance cases". Automated results are from the 515-test run on `a2d9668` (rules version 1). An automated fixture passing does not pass a human, phone or upload requirement; those parts are called out.

| ID | Acceptance case | Test file / fixture | Result | Status |
|---|---|---|---|---|
| CS-01 | Co-located dash departs normally; contact arms only after separation; tiny moves still reunite by route exhaustion | `tests/sim/movement.test.ts`: "starts reunited, departs normally from a co-located start (case 1)", "arms contact only after separating beyond combined radii plus tolerance", "tiny movements reunite by route exhaustion without arming contact"; `tests/sim/route.test.ts`: "starts a fresh route from co-located endpoints" | pass | PASS |
| CS-02 | Contact with the moving soul ends the dash at the previewed point, collapses loops once, applies normal recovery | `tests/sim/contact.test.ts`: "an offensive dash at the moving soul stops exactly at the previewed contact point", "collapses a looped route once, then normal recovery applies" | pass | PASS |
| CS-03 | Touching ribbon alone does not reunite; backward offensive movement spends capacity before genuine contact | `tests/sim/contact.test.ts`: "crossing the old ribbon far from the soul does not reunite or rewire the path", "backward offensive movement spends normal capacity until genuine contact"; `tests/sim/route.test.ts`: "keeps self-crossing loops intact" | pass | PASS |
| CS-04 | Short contact-dash, long taut RETURN and wall-separated RETURN each keep a useful role (three paper states) | `tests/sim/contact.test.ts`: the three "paper states (case 4)" tests, plus "contact whose snap would clip a wall corner is refused until the corridor is clear" (PATH-17) | Mechanics reproduce the table. Whether each choice is *useful* in real play is a human judgement (GATE-F4) | PASS (mechanics) |
| CS-05 | Shared health: body, soul, both same step, both adjacent steps — no duplicate damage | `tests/sim/damage.test.ts` "shared health and attack-ID dedup (case 5)": body, soul, both reunited endpoints at once, lane both endpoints same step, adjacent steps, second attack inside grace shielded, defeat at zero | pass | PASS |
| CS-06 | Dash protection begins/ends correctly; soul never inherits it; RETURN never attacks, cuts or protects | `tests/sim/damage.test.ts` "dash protection (case 6)": cuts bolts during travel, ends at arrival (recovery hit), soul never protected, RETURN never cuts/kills/protects, lane shielded while dashing but hits after arrival | pass | PASS |
| CS-07 | Earlier cut vs earlier soul hit resolves by event time; exact tie per documented policy | `tests/sim/damage.test.ts` "event-time ordering of cuts and soul hits (case 7)": earlier cut prevents later soul hit; earlier soul hit not erased by later cut; exact tie is cut (player-favoring, documented in COMBAT_SPEC) | pass | PASS |
| CS-08 | Persistent lane damages again on a later activation; first hit grants no permanent immunity | `tests/sim/damage.test.ts` "persistent lanes (case 8)" (4 tests); `tests/sim/regressions.test.ts` (2 fuzz-found lane regressions) | pass | PASS |
| CS-09 | Both endpoints consume a final segment; corners, self-crossings, zigzags and vertex limit keep legal geometry | `tests/sim/actions.test.ts` "route geometry under stress (case 9)"; `tests/sim/route.test.ts` head/tail consumption through corners; `tests/sim/fuzz.test.ts` invariants after every step across seeded rooms | pass | PASS |
| CS-10 | Wall truncates preview and travel identically; no door invalidates a committed route | `tests/sim/actions.test.ts` "walls truncate preview and execution identically (case 10)"; `tests/sim/geom.test.ts` sweeps. Rooms have only static walls (no doors exist) | pass | PASS |
| CS-11 | Aiming across changing capacity refreshes preview; buffered release revalidates | `tests/sim/actions.test.ts` "preview freshness and the input buffer (case 11)" (6 tests) | pass | PASS |
| CS-12 | Real phones: tap/drag distinction, cancel, extra pointers, lock/background, orientation, retry, mute | Automated: `tests/input/gesture.test.ts`, `tests/input/gesture.fuzz.test.ts`, `tests/input/pointer.test.ts`, `tests/core/lifecycle.test.ts`, `tests/core/loop.test.ts` pass. Emulated: EMU-03/04 below | Real phones not available | BLOCKED — no phone access |
| CS-13 | Source death leaves fired projectiles alive; a locked attack never retargets | `tests/sim/enemies.test.ts`: "killing the source after firing leaves its bolt alive (case 13)", "a locked warning never retargets, even if the target moves", "killing a locked source cancels its unlaunched attack" | pass | PASS |
| CS-14 | Full-tether states allow fair anticipation/recovery; survival does not require twitch interception | Proxies pass: `tests/bot/departure-court.test.ts` (novice-timed bot, 0.4 s aim, 0.35 s reactions), `tests/content/bot-clears-a.test.ts` / `bot-clears-b.test.ts` (novice and expert clears of every playable room variant, 15 + 13 tests), `tests/content/fairness.test.ts` (48), `tests/sim/rooms.test.ts` telegraph-lead and idle-safety probes | Bot proxies are not human play | NOT RUN (human play) |
| CS-15 | Earned reunion effects fire once per separated→reunited transition; empty loops cannot farm | Relic loadout, drafts and charge carry-over are tested (`tests/run/relics.test.ts`, `tests/run/expedition.test.ts`). No test in this log demonstrates a Mourning Bell burst or Traveler's Knot decoy firing once per reunion inside the simulation; EMU-13 carried Mourning Bell through two rooms without checking its burst | Not evidenced | NOT RUN |
| CS-16 | Room-entry/reward/draft save boundaries survive reload without duplication or reroll | Automated: `tests/save/checkpoint.test.ts` (32, incl. "commits a room completion with its reward exactly once", "keeps a station draft committed exactly once across reloads", corrupt-slot fallback), `tests/run/fuzz.test.ts` save/load at every step, `tests/game/director.test.ts` (6: "Continue restarts the saved room from the same entry state", "a repeated victory callback cannot pay a room twice", "a defeat retries the same room with the same seed and entry health"). Emulated in the built game: EMU-12 (a real page reload in room 2 offers Continue with "Continue restarts this room." and restarts the same node and room at entry health). Not yet exercised in a browser: reload on a station draft or on a victory result panel, and the corrupt/blocked-storage path | Partial: room-entry reload verified in Edge and Chrome; draft and reward reloads automated only | PASS (partial: room-entry reload) |
| CS-17 | Exact exported and uploaded build tested, not only the dev preview | Exact ZIP tested locally: AUTO-04, AUTO-05 and EMU-01..EMU-14 ran on `outrun-your-soul-0.1.0-a2d9668.zip` | Not uploaded to itch.io (publishing needs owner authorization) | BLOCKED — no upload |

## B. Emulated-browser checks (supplementary only)

`npm run e2e` (scripts/e2e.mjs, 25 checks) unless noted, on the exact ZIP `outrun-your-soul-0.1.0-a2d9668.zip`. Headless **Microsoft Edge 156.0.4314.50** and **Google Chrome 156.0.8078.74** (system installs, driven by playwright-core 1.64.1). Viewport 375x812 CSS px, deviceScaleFactor 2, `isMobile`, `hasTouch`. WebGL renderer: ANGLE / AMD Radeon integrated GPU (Direct3D11) on the desktop. The game is served under an itch-like nested path `/html/1234567/` and loaded top-level, not inside the iframe. Run seeds: 7 for the UI session, 11 for the full expedition. **These are desktop-GPU numbers and emulated touch, not phone evidence.** Edge 25/25 and Chrome 25/25 (reports: `art/reports/e2e-report-msedge.json`, `art/reports/e2e-report-chrome.json`; screenshots `art/previews/e2e-*.png` from the Edge run).

| ID | Scenario | Browser + version | Viewport / DPR | Build | Observation | Status |
|---|---|---|---|---|---|---|
| EMU-01 | Cold load under the nested path (production URL, no `?debug`) | Edge 156.0.4314.50; Chrome 156.0.8078.74 | 375x812 / 2 | `...-a2d9668.zip` | WebGL2 canvas; `window.__oys` absent; Begin visible after 953 ms (Edge) / 860 ms (Chrome); first WebGL draw 585 / 624 ms; 2,052,413 bytes transferred. No console errors, page errors or failed requests. The title scene renders the packaged GLBs, not placeholders: `courier_body`, `soul_mask`, `needler`, `keeper`, `exit_gate`, `distant_engine` and `threshold_inlay` each match their GLB triangle counts in the live three.js scene. Screenshot `art/previews/e2e-title.png` | PASS |
| EMU-02 | 360x640 and 390x844 portrait: HUD, safe areas, whole room visible, no horizontal scroll | — | — | — | Only 375x812 exercised so far | NOT RUN |
| EMU-03 | Touch drag/release dash and short tap RETURN on the canvas | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | Real CDP touch events (→ Pointer Events, pointerType touch): a 130 px upward drag from (187, 640) dashed (body (4.00, 1.50) → (4.00, 4.38)); a short `touchscreen.tap` while separated started RETURN (returns 0 → 1). Dead-zone cancel and long press were not exercised in a browser (covered by `tests/input/gesture.test.ts`). Screenshot `art/previews/e2e-first-dash.png` | PASS |
| EMU-04 | Tab hidden / window blur pauses and cancels the gesture; explicit Resume continues the same state | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | `visibilitychange` with `document.visibilityState` overridden to hidden: phase `paused`, Paused dialog visible, sim time frozen over 1 s of real time; tapping Resume continued the same in-memory state. A window `blur` also paused and froze time. Synthetic events, not a real tab switch or phone lock. Screenshot `art/previews/e2e-paused.png` | PASS |
| EMU-05 | WebGL2 unavailable path shows a readable message | — | — | — | — | NOT RUN |
| EMU-06 | Reduced-motion setting removes shake/flowing stripes but keeps all information | — | — | — | — | NOT RUN |
| EMU-07 | Muted play remains understandable | — | — | — | Headless runs produce no audible output to judge | NOT RUN |
| EMU-08 | Repeated restart (20x) does not grow entity/listener/audio counts | — | — | — | Single baseline after clearing room 1: Edge JS heap 12.9 MB used / 20.6 MB total, 284 DOM nodes, 192 listeners | NOT RUN |
| EMU-09 | Real UI path into the first room, scripted clear, Onward | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | Taps on: Begin → starter panel "Who carries the thread?" (Threadkeeper enabled, Long Reach locked on fresh storage) → Threadkeeper → Departure Court with its intro card ("Departure Court · stop 1 of 7"). The greedy bot (`tests/sim/bot.ts`, deciding in Node from page state) cleared it in 11.56 s sim with 0 hits (Edge). The result panel showed "The gate opens." with Onward. Screenshots `e2e-starter.png`, `e2e-telegraph.png`, `e2e-victory.png` | PASS |
| EMU-10 | Render cost in live play (2 s, room 1, n1 dormant) | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | Counted by wrapping WebGL draw calls: 42 draw calls/frame (p50 = max; budget ≤60), about 21,155 triangles/frame. Frame interval p50 6.1 ms, p95 6.2 ms (Edge, uncapped headless, desktop iGPU). **Not phone frame pacing** | PASS (budget check only) |
| EMU-11 | Lead's manual playthrough in the built-in browser pane | Claude desktop built-in browser pane, mobile emulation | 375x812 | main at about 15:05 UTC (exact commit not recorded; single-room build) | 2026-10-30 ~15:05 UTC. Departure Court cleared in 12.1 s sim time with 0 hits, 1 cut and 4 kills, via commands driven through the debug hook plus one real mouse-drag dash. Observed rendered: dash, kill, soul trail, telegraph, locked band, cut, "gate needs both" state, victory panel. Finding: the keeper's current-position aim rarely threatens a moving soul (being changed to forecast aim) | PASS (observation) |
| EMU-12 | Onward → route choice → room 2 → page reload → Continue | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | Onward showed "Choose your line" with two cards (Silk Cloister, Needle Gallery). Tapping the first entered node n1a (Silk Cloister, authored data) with its intro card. `page.reload()` in room 2: the title showed Continue, the caption "Continue restarts this room.", detail "Silk Cloister · 5 health" and New expedition. Tapping Continue restarted node n1a in `silk_cloister` at entry health 5, sim t 0.37 s, with run history unchanged. Screenshots `e2e-route.png`, `e2e-room2-intro.png`, `e2e-continue.png` | PASS |
| EMU-13 | Full expedition to the ending through every panel | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | `__oys.start('threadkeeper')` (seed 11), then the bot in rooms and DOM taps on every panel, taking the first offered relic. Edge route n0 Departure Court → n1a Needle Gallery → n2 Signal House (took Mourning Bell) → n3a Mourner's Garden → n4 Final Crossing (took Long Silk, setting down Needlesong) → n5 Last Platform → n6 The Last Warden → "Escaped.". 5 rooms cleared on the first attempt, 47.67 s total sim (16 s wall), 0 hits, 20 kills, 0 failures; final loadout Long Silk + Mourning Bell. Chrome: same route, 48.55 s, 1 hit. Afterwards "Again" returned to a title with Begin, and the starter panel had Long Reach unlocked. The greedy bot needed a walls-aware fallback dash 0 times in this run (it had stalled behind the plinth in an earlier build). Screenshots `e2e-station.png`, `e2e-ending.png` | PASS |
| EMU-14 | Deliberate defeat → Retry room | Edge; Chrome | 375x812 / 2 | `...-a2d9668.zip` | In Silk Cloister the script walked toward sentries (never within kill range) and stood in their firing lines: defeat at 18.95 s sim, 0 kills. The result panel offered Retry room and Abandon expedition. Retry restarted node n1a at entry health 5 as attempt 2 (failed attempts 0 → 1; intro "Attempt 2 — the room is as you entered it."). Standing still at spawn would not lose this room: its walls cover the spawn from every firing line (idle 150 s sim took no damage). Screenshot `e2e-defeat.png` | PASS |

E2E caveats: Edge and Chrome report `net::ERR_ABORTED` for `courier_body.glb` on every page load of this build (once for `distant_engine.glb` in earlier builds), after an HTTP 200 response. The live scene shows the courier rendered from its GLB (814 triangles = the GLB; materials `ivory`, `vc`, `vermilion`), so the e2e records the abort as a note. Any aborted model whose GLB is not verified in the scene, or any other aborted URL that never completed, fails the run. The e2e drives rooms through the `?debug` hook with the greedy test bot; it proves the flow works, not that a human finds it fair or fun.

## C. Real-device and real-host checks (gate-passing layer)

No phone has been available to this work, and nothing has been uploaded to itch.io (publishing needs the owner's authorization). Use the direct build and the **actual uploaded itch.io page** when these run.

| ID | Scenario | Device / OS | Browser + version | Direct or itch embed | Build | Observation | Status |
|---|---|---|---|---|---|---|---|
| DEV-01 | Cold load and first usable action time | Android phone | Chrome | | | | BLOCKED — no Android phone access |
| DEV-02 | Cold load and first usable action time | iPhone | Safari | | | | BLOCKED — no iPhone access |
| DEV-03 | Touch: drag/release dash, tap RETURN, dead-zone cancel, long press, second finger ignored | Android | Chrome | | | | BLOCKED — no Android phone access |
| DEV-04 | Touch: same as DEV-03 | iPhone | Safari | | | | BLOCKED — no iPhone access |
| DEV-05 | Lock screen / app switch / orientation change mid-aim: gesture cancelled, paused, Resume continues | Android | Chrome | | | | BLOCKED — no Android phone access |
| DEV-06 | Same as DEV-05 | iPhone | Safari | | | | BLOCKED — no iPhone access |
| DEV-07 | Audio starts only after deliberate input; mute persists; no burst on resume | Android + iPhone | | | | | BLOCKED — no phone access |
| DEV-08 | Frame pacing sample (duration, p95 frame time, DPR, thermal trend) in the encounter | named phone | | | | | BLOCKED — no phone access |
| DEV-09 | Page does not scroll/zoom during aim; address bar / safe areas do not hide controls | Android + iPhone | | | | | BLOCKED — no phone access |
| DEV-10 | Full expedition start → death → retry → ending on the itch.io embed, plus reload → Continue | phone | | itch embed | | | BLOCKED — not uploaded; no phone access |
| DEV-11 | Blender actors + room modules render correctly (scale, pivots, colours) on phone | phone | | | | Desktop emulated screenshots and GLB scene verification exist (EMU-01); not phone evidence | BLOCKED — no phone access |

## First-encounter decision gate (ROADMAP section 5)

Human observation on a real phone. Record what a fresh player actually did, without coaching; no averaged scores. Disposition requires every category to pass on its own. No fresh player has played any build yet. The emulated screenshots and EMU-09..EMU-14 are inputs for review, not gate evidence.

| ID | Category | Gate item | Players / device | Build | Observation | Status |
|---|---|---|---|---|---|---|
| GATE-F1 | Fun | Fresh player performs a meaningful action within ~10 s and understands the central tradeoff within ~30 s, uncoached | | | | NOT RUN |
| GATE-F2 | Fun | Input does not repeatedly confuse dash, cancel and RETURN | | | | NOT RUN |
| GATE-F3 | Fun | A failure can be explained by the player; retry is immediate | | | Emulated: Retry room restarts the room as attempt 2 (EMU-14); human explanation of failures not observed | NOT RUN |
| GATE-F4 | Fun | Chaining, safe flank, offensive contact dash and vulnerable RETURN each have a situational reason | | | Lead observation (EMU-11): keeper aim rarely threatened a moving soul in the single-room build (forecast aim in progress) | NOT RUN |
| GATE-F5 | Fun | Full-tether threats leave a real response for ordinary touch play | | | | NOT RUN |
| GATE-V1 | Visual | Phone-scale still and silent 5–10 s clip distinguish body, soul, harmless ribbon, active hazard, warning, safe floor | | | Emulated 375x812 stills exist (`art/previews/e2e-*.png`); no clip and no real phone yet | NOT RUN |
| GATE-V2 | Visual | Art direction coherent and attractive in motion, not just a Blender render | | | | NOT RUN |
| GATE-V3 | Visual | Finger occlusion, reduced motion and muted play keep essential information | | | | NOT RUN |
| GATE-V4 | Visual | Hit, cut, separation and reunion have crisp, different feedback | | | | NOT RUN |
| GATE-T1 | Theme | Players notice the two movement speeds before being told the theme | | | | NOT RUN |
| GATE-T2 | Theme | Equalizing body and soul speeds removes a central route dilemma (A/B build) | | | No equal-speed comparison build exists | NOT RUN |
| GATE-T3 | Theme | More speed can both help and expose; not just a countdown or animation rate | | | | NOT RUN |

**Disposition:** _not decided_ (pass provisionally and expand / hold and fix / reject or rework). Date, deciding owner and reasons go here.

## Release record

Mirror of [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Never store private contact answers, cookies, tokens or dashboard links here.

| Field | Value |
|---|---|
| Candidate commit | None chosen (latest verified build: `a2d9668`, see build record) |
| ZIP filename / SHA-256 | No release candidate yet |
| Devices / browsers actually tested | Desktop headless Edge 156 and Chrome 156 with phone emulation only; no phone |
| itch.io project URL | Not published |
| Jam entry URL | Not submitted |
| Submission timestamp (UTC and IST) | Pending |
| Known remaining defects | `courier_body.glb` request reported aborted after HTTP 200 on every load (model still renders from the GLB; cause unknown); keeper aim vs moving soul (lead, in progress); boss models over the Warden material row with no boss budget recorded; small props over "normally one material"; relic arrival effects not evidenced (CS-15); no reduced-motion, muted, WebGL2-missing or other-viewport browser checks yet |

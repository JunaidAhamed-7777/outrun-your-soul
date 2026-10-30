# Evidence log

Status: **template, 30 October 2026. Every row below is NOT RUN.** This log records what was actually tested, on which build, where, and with what result. It follows [TEST_PLAN.md](TEST_PLAN.md) section 1 and [QUALITY_AND_STATUS.md](QUALITY_AND_STATUS.md). A row changes only when someone runs the check and writes down the evidence; feature counts, paper traces and desktop previews never fill a phone or itch.io row.

## How to record

- **Status:** `PASS` / `FAIL` / `BLOCKED` / `NOT RUN`. BLOCKED names the missing device, access or build (for example "BLOCKED — no iPhone available").
- **Build:** the ZIP name from `npm run package` (it embeds version and short commit; a `-dirty` suffix means uncommitted changes and is never a release build) plus its SHA-256 from the printed output or `release/<name>.json`.
- **Commit:** full SHA. **Rules version:** `rulesVersion` from the simulation state.
- **Where:** for automated rows, the command; for emulated rows, browser + version + emulated viewport/DPR; for real devices, device model, OS version, browser + version, and whether it was the direct build or the itch.io embed.
- **Evidence:** command output excerpt, screenshot/clip path, or a short factual observation. No ratings or "looks good".
- Severity for failures uses TEST_PLAN: **P0** cannot load/play/finish/retry or corrupts progress; **P1** wrong damage/immunity, unreliable touch, misleading preview/telegraph, unacceptable phone performance; **P2** nonblocking.

Three evidence layers are kept separate below. **Only layer C can pass a phone or itch.io gate.**

| Layer | What it proves | What it cannot prove |
|---|---|---|
| A. Automated | Deterministic rules, invariants, package structure, relative URLs, model structure | Feel, readability, touch reliability, performance, the real upload |
| B. Emulated browser | Layout at phone viewport sizes, rendering, pointer logic with mouse/emulated touch | Real touch hardware, mobile GPU/thermals, iOS Safari quirks, itch.io iframe |
| C. Real device / real host | Phone touch, performance, audio unlock, lifecycle, the actual itch.io page | Nothing is assumed beyond the exact device, browser and build listed |

## Build record

| Build (ZIP name) | SHA-256 | Commit | Rules version | Command | Date (UTC) | Notes |
|---|---|---|---|---|---|---|
| _none yet_ | | | | `npm run verify` | | |

## A. Automated checks

Run `npm run verify` (typecheck, unit tests, build, package, model validation, nested-iframe crawl of the exact ZIP). Record one row per build you intend to rely on.

| ID | Check | Command | Build | Result | Evidence | Status |
|---|---|---|---|---|---|---|
| AUTO-01 | Typecheck | `npm run typecheck` | | | | NOT RUN |
| AUTO-02 | Unit + simulation tests | `npm test` | | | test count, failures | NOT RUN |
| AUTO-03 | Production build | `npm run build` | | | | NOT RUN |
| AUTO-04 | itch.io package rules (index.html at root, relative URLs, limits, names) | `npm run package` | | | ZIP name, bytes, SHA-256 | NOT RUN |
| AUTO-05 | Nested itch-style iframe crawl of the exact ZIP | `node scripts/check-nested.mjs --zip release/<name>.zip` | | | PASS line | NOT RUN |
| AUTO-06 | Model validation (Khronos + contract + budgets) | `npm run check:models` | | | `art/reports/models-validation.json` | NOT RUN |
| AUTO-07 | Simulation never imports renderer/DOM/wall clock | `npm test` (boundaries) | | | | NOT RUN |

### COMBAT_SPEC mandatory acceptance cases (automated fixtures where possible)

Source: [COMBAT_SPEC.md](COMBAT_SPEC.md) "Mandatory acceptance cases". Cases 12, 14 and 17 also need layer B/C rows below; an automated fixture alone does not pass them.

| ID | Acceptance case | Test file / fixture | Build | Result | Status |
|---|---|---|---|---|---|
| CS-01 | Co-located dash departs normally; contact arms only after separation; tiny moves still reunite by route exhaustion | | | | NOT RUN |
| CS-02 | Contact with the moving soul ends the dash at the previewed point, collapses loops once, applies normal recovery | | | | NOT RUN |
| CS-03 | Touching ribbon alone does not reunite; backward offensive movement spends capacity before genuine contact | | | | NOT RUN |
| CS-04 | Short contact-dash, long taut RETURN and wall-separated RETURN each keep a useful role (three paper states) | | | | NOT RUN |
| CS-05 | Shared health: body, soul, both same step, both adjacent steps — no duplicate damage | | | | NOT RUN |
| CS-06 | Dash protection begins/ends correctly; soul never inherits it; RETURN never attacks, cuts or protects | | | | NOT RUN |
| CS-07 | Earlier cut vs earlier soul hit resolves by event time; exact tie per documented policy | | | | NOT RUN |
| CS-08 | Persistent lane damages again on a later activation; first hit grants no permanent immunity | | | | NOT RUN |
| CS-09 | Both endpoints consume a final segment; corners, self-crossings, zigzags and vertex limit keep legal geometry | | | | NOT RUN |
| CS-10 | Wall truncates preview and travel identically; no door invalidates a committed route | | | | NOT RUN |
| CS-11 | Aiming across changing capacity refreshes preview; buffered release revalidates | | | | NOT RUN |
| CS-12 | Real phones: tap/drag distinction, cancel, extra pointers, lock/background, orientation, retry, mute | automated part only; see C | | | NOT RUN |
| CS-13 | Source death leaves fired projectiles alive; a locked attack never retargets | | | | NOT RUN |
| CS-14 | Full-tether states allow fair anticipation/recovery; survival does not require twitch interception | needs human play (C) | | | NOT RUN |
| CS-15 | Earned reunion effects fire once per separated→reunited transition; empty loops cannot farm | | | | NOT RUN |
| CS-16 | Room-entry/reward/draft save boundaries survive reload without duplication or reroll | | | | NOT RUN |
| CS-17 | Exact exported and uploaded build tested, not only the dev preview | AUTO-04/05 + C rows | | | NOT RUN |

## B. Emulated-browser checks (supplementary only)

Desktop Chrome/Firefox, device emulation and the built-in preview browser. Useful for layout and logic; never a substitute for C.

| ID | Scenario | Browser + version | Viewport / DPR | Build | Observation | Status |
|---|---|---|---|---|---|---|
| EMU-01 | Cold load of the built ZIP served by `node scripts/check-nested.mjs --zip <zip> --serve` (nested iframe) | | 360×640 | | | NOT RUN |
| EMU-02 | 360×640 and 390×844 portrait: HUD, safe areas, whole room visible, no horizontal scroll | | | | | NOT RUN |
| EMU-03 | Mouse drag/release dash, short click RETURN, drag back to dead zone cancels, long press does nothing | | | | | NOT RUN |
| EMU-04 | Tab switch / window blur pauses and cancels gesture; explicit Resume continues the same state | | | | | NOT RUN |
| EMU-05 | WebGL2 unavailable path shows a readable message (forced via flag/emulation) | | | | | NOT RUN |
| EMU-06 | Reduced-motion setting removes shake/flowing stripes but keeps all information | | | | | NOT RUN |
| EMU-07 | Muted play remains understandable | | | | | NOT RUN |
| EMU-08 | Repeated restart (20×) does not grow entity/listener/audio counts (renderer.info, console) | | | | | NOT RUN |

## C. Real-device and real-host checks (gate-passing layer)

Use the direct build and the **actual uploaded itch.io page**. Record unavailable hardware as BLOCKED.

| ID | Scenario | Device / OS | Browser + version | Direct or itch embed | Build | Observation | Status |
|---|---|---|---|---|---|---|---|
| DEV-01 | Cold load and first usable action time | Android phone | Chrome | | | | NOT RUN |
| DEV-02 | Cold load and first usable action time | iPhone | Safari | | | | NOT RUN |
| DEV-03 | Touch: drag/release dash, tap RETURN, dead-zone cancel, long press, second finger ignored | Android | Chrome | | | | NOT RUN |
| DEV-04 | Touch: same as DEV-03 | iPhone | Safari | | | | NOT RUN |
| DEV-05 | Lock screen / app switch / orientation change mid-aim: gesture cancelled, paused, Resume continues | Android | Chrome | | | | NOT RUN |
| DEV-06 | Same as DEV-05 | iPhone | Safari | | | | NOT RUN |
| DEV-07 | Audio starts only after deliberate input; mute persists; no burst on resume | Android + iPhone | | | | | NOT RUN |
| DEV-08 | Frame pacing sample (duration, p95 frame time, DPR, thermal trend) in the encounter | named phone | | | | | NOT RUN |
| DEV-09 | Page does not scroll/zoom during aim; address bar / safe areas do not hide controls | Android + iPhone | | | | | NOT RUN |
| DEV-10 | Full encounter start → death → retry → victory on the itch.io embed | phone | | itch embed | | | NOT RUN |
| DEV-11 | Blender actor + room module render correctly (scale, pivots, colours) on phone | phone | | | | | NOT RUN |

## First-encounter decision gate (ROADMAP section 5)

Human observation on a real phone. Record what a fresh player actually did, without coaching; no averaged scores. Disposition requires every category to pass on its own.

| ID | Category | Gate item | Players / device | Build | Observation | Status |
|---|---|---|---|---|---|---|
| GATE-F1 | Fun | Fresh player performs a meaningful action within ~10 s and understands the central tradeoff within ~30 s, uncoached | | | | NOT RUN |
| GATE-F2 | Fun | Input does not repeatedly confuse dash, cancel and RETURN | | | | NOT RUN |
| GATE-F3 | Fun | A failure can be explained by the player; retry is immediate | | | | NOT RUN |
| GATE-F4 | Fun | Chaining, safe flank, offensive contact dash and vulnerable RETURN each have a situational reason | | | | NOT RUN |
| GATE-F5 | Fun | Full-tether threats leave a real response for ordinary touch play | | | | NOT RUN |
| GATE-V1 | Visual | Phone-scale still and silent 5–10 s clip distinguish body, soul, harmless ribbon, active hazard, warning, safe floor | | | | NOT RUN |
| GATE-V2 | Visual | Art direction coherent and attractive in motion, not just a Blender render | | | | NOT RUN |
| GATE-V3 | Visual | Finger occlusion, reduced motion and muted play keep essential information | | | | NOT RUN |
| GATE-V4 | Visual | Hit, cut, separation and reunion have crisp, different feedback | | | | NOT RUN |
| GATE-T1 | Theme | Players notice the two movement speeds before being told the theme | | | | NOT RUN |
| GATE-T2 | Theme | Equalizing body and soul speeds removes a central route dilemma (A/B build) | | | | NOT RUN |
| GATE-T3 | Theme | More speed can both help and expose; not just a countdown or animation rate | | | | NOT RUN |

**Disposition:** _not decided_ (pass provisionally and expand / hold and fix / reject or rework). Date, deciding owner and reasons go here.

## Release record

Mirror of [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Never store private contact answers, cookies, tokens or dashboard links here.

| Field | Value |
|---|---|
| Candidate commit | Pending |
| ZIP filename / SHA-256 | Pending |
| Devices / browsers actually tested | None recorded |
| itch.io project URL | Not published |
| Jam entry URL | Not submitted |
| Submission timestamp (UTC and IST) | Pending |
| Known remaining defects | Not assessed |

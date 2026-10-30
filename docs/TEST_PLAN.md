# OUTRUN YOUR SOUL — Test Plan and Release Gates

**Status:** planned validation, 30 October 2026. No tests below are marked passed. Do not convert paper traces into playtest or benchmark claims. Use with [ROADMAP.md](ROADMAP.md).

**Target:** portrait touch browser game; Three.js orthographic low-poly presentation over a deterministic 2D rules model. Blender assets are visual only; no 3D physics. Test actual phones and the actual itch.io embed. Desktop resizing is useful but not a phone pass.

## 1. Evidence, severity and test layers

For each execution record: **test ID, build/commit, rules version, seed/fixture, device/browser/version, input sequence, expected result, actual result, evidence link, status, owner**. Status is **PASS / FAIL / BLOCKED / NOT RUN**. Record regressions against the exact final build. No checkboxes in this document are completed by its existence.

- **P0:** cannot load/play, corrupts progress, cannot finish/retry, unrecoverable softlock.
- **P1:** wrong damage/immunity, unreliable touch, misleading preview/telegraph, broken core relic/room, unacceptable phone performance.
- **P2:** nonblocking visual/audio/content issue. A severe readability issue is P1, not “cosmetic.”
- Release requires no unresolved P0/P1. Blocked critical phone/embed tests are not passes.
- Layers: deterministic rule fixtures → scenario/room integration → renderer/input integration → actual-device human play → exact-host release checks.

Where numeric tuning is provisional, record the chosen value and version before testing. Start from illustrative dash ≤3 tiles at 15 tiles/s, soul 2 tiles/s, recovery ~0.15s, route ≤6 tiles, proposed 64 vertices; do not disguise these as measured balance.

## 2. State and replay invariants

- [ ] **SIM-01** Same initial state, RNG seed/state and tick-stamped command sequence yield identical authoritative state hashes at checkpoints despite 30/60/120Hz presentation and injected render stalls.
- [ ] **SIM-02** Render tweens, particles, audio, camera shake and art RNG never alter movement, hits, rewards or enemy targeting.
- [ ] **SIM-03** Fixed simulation order and exact-tie collision policy are documented and reproducible. Changing entity iteration order does not change an outcome.
- [ ] **SIM-04** All pause/background clocks freeze together: body, soul, projectiles, enemy windups, grace, boost and return. Resume has no wall-clock catch-up.
- [ ] **SIM-05** Stable IDs survive checkpoints; attack, enemy and reward identities cannot collide or double-award after retries.
- [ ] **SIM-06** Restart removes old callbacks, buffered input, projectiles, trails, camera/audio effects and pending victory/defeat actions.

A proposed 20Hz rules tick is not a license to ignore collisions within its 50ms span. Swept contact times remain authoritative.

## 3. Tether, walls and physical reunion

Four invariants after every step: endpoint positions match stored path; length equals sum of retained segments within declared tolerance; no negative or over-capacity length; every segment follows legal world geometry. Outward movement appends; RETURN consumes tail; soul consumes head. Physical endpoint reunion is the explicit exception that clears a remaining loop.

| ID | Fixture/action | Required outcome |
|---|---|---|
| PATH-01 | Soul traverses several corners in one tick | Sweep each traversed segment; never shortcut old→new position through a wall |
| PATH-02 | RETURN on a U-shaped path, endpoints close across a wall | Body follows reverse corners; no Euclidean shortcut |
| PATH-03 | Head and tail consume last segment simultaneously | Meet along the path, clamp once; no crossed endpoints, negative length or jitter |
| PATH-04 | 0, tiny, maximum and just-over-capacity moves | Preview and accepted movement agree; invalid action spends nothing |
| PATH-05 | Proposed 63/64/65 vertices; tiny zigzags | Vertex limit enforced visibly; no silent old-path deletion; only safe forward-collinear simplification |
| PATH-06 | Self-intersection or crossing an old ribbon | No route splice, reunion, damage or capacity reset from ribbon alone |
| PATH-07 | Blocked/interrupted outward dash | Append actual traveled route, not intended endpoint |
| PATH-08 | Start body/soul co-located | First dash departs; contact not armed prematurely |
| PATH-09 | Separation beyond radii+tolerance, then swept endpoint contact | Remaining route clears, including loop; outward dash ends and normal recovery begins |
| PATH-10 | Tiny move never arms separation, then route exhausts | Ordinary reunion still works; no stranded near-overlap |
| PATH-11 | Body and soul both move and cross during a tick | Detect relative swept contact, piecewise across corners; not body sweep against soul’s final point |
| PATH-12 | Stay co-located for many ticks; repeat empty taps | One separated→reunited event only; no repeated arrival burst/decoy or free charge |
| PATH-13 | Static wall grazing / corner / collision radius | Preview, body and soul respect the same 2D collision geometry despite 3D art |
| PATH-14 | Capacity freed while aiming | Preview updates; executed command validates current authoritative state |
| PATH-15 | Extraction body-first, soul-first, body leaves, last-tick damage | Exit only under explicit reunited/success rules; no premature victory or duplicate results |
| PATH-16 | Eligible radius contact with a nonzero center gap | Anchor is body position at time of impact; soul gap ≤combined radii+tolerance; both centers coincide and route is zero afterward |
| PATH-17 | Near contact through thin wall or blocked corner | Reject contact-collapse if full-radius soul corridor or anchor footprint is blocked; retain legal path until eligible contact/exhaustion |
| PATH-18 | Contact anchor fits body but not soul footprint | Reject collapse; preview uses same footprint eligibility, no wall embedding |
| PATH-19 | Bounded soul snap crosses an active lane/bolt | Sweep hazards across gap at reunion event time; retain earlier hits, ordinary attack-ID dedup/global grace only, no new immunity |

**Three contact-versus-RETURN scenarios:**
- Two-tile straight gap with four tiles free: offensive dash can reach the moving soul and cuts eligible bolts until contact; RETURN is vulnerable.
- Five-tile gap with one tile free: offensive movement cannot reach by range/capacity; RETURN can consume the full route.
- Six-tile U path around a wall, endpoints two tiles apart: direct dash is wall-clipped; RETURN follows corners.

These are fixtures to implement, not claims already validated.

## 4. Collision, damage and attack identity

- [ ] **HIT-01** Body only, soul only, both endpoints in same tick, both in adjacent ticks: shared health is charged once per intended attack/grace contract. Feedback identifies the actual contact.
- [ ] **HIT-02** Outward travel protects body only. Soul still takes valid hits while body dashes. Aim, idle, recovery and RETURN have no dash protection.
- [ ] **HIT-03** RETURN through enemy/projectile neither attacks nor cuts nor protects. Earned arrival effect happens only on actual reunion, never along return travel.
- [ ] **HIT-04** Projectile meets outward sweep before reaching soul: cut prevents later hit. Projectile reaches soul first: damage counts. Exact simultaneous tie follows documented policy.
- [ ] **HIT-05** Reunion ends dash immunity at contact time; nearby projectile/beam is resolved chronologically, not from final-state immunity or array order.
- [ ] **HIT-06** One continuous overlap does not repeatedly damage each frame. Later beam activation with a new attack ID can damage again after grace.
- [ ] **HIT-07** Killing shooter removes unlaunched attacks only; already-fired bolts continue.
- [ ] **HIT-08** Environmental beam cannot be cut; its shape/motion/audio distinguish it from cuttable bolts.
- [ ] **HIT-09** Warning locks target when shown. Moving body/soul afterward does not silently redirect it.
- [ ] **HIT-10** Damage, kill, arrival burst and victory on same tick use declared event order; one result screen, no reward duplication or post-death attack farming.
- [ ] **HIT-11** Dash crosses a thin projectile/wall at low render FPS: continuous collision still detects it.
- [ ] **HIT-12** Global post-hit grace is visible and expires consistently; it is not mislabeled as RETURN invulnerability.

## 5. Touch, preview and human aiming

- [ ] **INPUT-01** Relative drag can start in a comfortable lower-screen area; preview originates at body without finger covering target.
- [ ] **INPUT-02** Preview clips against distance, current tether capacity, walls and predicted endpoint contact. No hidden attack extension or surprise truncation.
- [ ] **INPUT-03** Short stationary tap returns only if aim never armed. Drag back into dead zone cancels; long stationary press does nothing.
- [ ] **INPUT-04** Pointer cancel, drag outside canvas, lost focus, second finger, browser gesture and orientation change cannot launch/spend an action accidentally.
- [ ] **INPUT-05** At most one visible buffered command; revalidate on execution. No queue of unseen moves or stale endpoint. Cancel/reset clears it.
- [ ] **INPUT-06** Input during recovery, pause, death, exit and draft cannot leak into the next room.
- [ ] **INPUT-07** Essential controls aim at 44–48 CSS-pixel targets with spacing; no tiny timeline, required multitouch or precision pinch.
- [ ] **INPUT-08** Main action remains readable with left/right thumb placement; HUD/safe-area/browser bars do not occlude active targets.
- [ ] **INPUT-09** Aiming leaves soul/enemy time running; explicit pause freezes all. No hidden slow motion.
- [ ] **INPUT-10** Desktop mouse/keyboard equivalents exercise the same commands; do not use their success to infer touch success.

### Paper traces to reproduce, then widen for real players

**Trace A — covered flank:** body/soul at (0,0), target (3,0), environmental beam crosses x=1 near y=0 during t=0.8–3.0. Safe route via (0,2)→(3,2)→(3,0). Three 0.4s aiming allowances plus illustrative travel/recovery place arrival near t=1.97. Verify outstanding capacity during the entire route, soul safety, body attack and safe return. Direct dash is faster but sends soul across the beam; an early offensive reunion may be a legitimate alternative, not a bug. Killing target does not delete the beam.

**Trace B — chain opening:** warden five tiles away opens t=1.0–1.8. Aim 0.4s, dash 3 tiles in 0.2s, recover 0.15s, aim 0.4s, dash 2 tiles in ~0.133s: arrival ~1.283s; soul has advanced ~1.77 tiles. Waiting for first reunion at ~1.9s, even while pre-aiming, makes final arrival ~2.033s, after opening. Do not fabricate extra aiming delay for the waiting policy.

For each trace:
- [ ] Reproduce exact math in production rules; record differences caused by collision radii/contact.
- [ ] Test normal pre-aim/input buffering; no unfair assumption that slow strategy wastes inputs.
- [ ] Add slower actual human aiming observations, not just idealized 0.4s commands.
- [ ] Widen warnings/openings where novices lack a real option. A numerical trace is not acceptable default difficulty.
- [ ] At full backlog, newly announced attacks leave an available safe action; mere flashing does not excuse unavoidable soul damage.
- [ ] Distinguish skillful interception from mandatory twitch survival.

## 6. Six relics and complete pair matrix

Two equipped slots maximum. Starter fills one; first draft fills second; later choice keeps/replaces. Drafts occur only at reunited safe checkpoints. No duplicates or third slot. Test every single relic and each legal pair below in a concrete encounter, not just in an inventory menu.

| Pair | Required interaction / counterpressure |
|---|---|
| Needlesong + Glass Lantern | Slowed bolt can aid interception, boost changes soul arrival; beam still dangerous |
| Needlesong + Long Silk | Boost refreshes without stacking and interacts deterministically with slower base rate |
| Needlesong + Short Stitch | Fast soul still follows corners/contact; no skipped arrivals or indefinite boost |
| Needlesong + Mourning Bell | Projectile cuts never count as kills; accelerated reunion consumes earned burst once |
| Needlesong + Traveler’s Knot | Cut/boost cannot duplicate decoy charges; lure affects only new lock |
| Glass Lantern + Long Silk | Larger backlog plus halo changes bolt exposure, no implied safe RETURN |
| Glass Lantern + Short Stitch | Moving halo boundary and faster soul yield deterministic entry/exit speed |
| Glass Lantern + Mourning Bell | Slow bolts remain dangerous around burst meeting point; burst cannot farm charge |
| Glass Lantern + Traveler’s Knot | Lured locked bolt keeps direction through halo; decoy does not block it |
| Long Silk + Short Stitch | **REJECT** in draft/load/replace; no combined universal upgrade |
| Long Silk + Mourning Bell | Long flank earns charge but reunion location matters; no auto-burst along RETURN |
| Long Silk + Traveler’s Knot | Long approach earns lure, new lock only; not retroactive protection |
| Short Stitch + Mourning Bell | Fast reunion places burst but reduced reach remains meaningful |
| Short Stitch + Traveler’s Knot | Early reunion spawns at most one lure; departure does not erase locked line |
| Mourning Bell + Traveler’s Knot | Same direct kills can update their declared counters, capped; burst kills recharge neither; lure persists only as specified |

**Single-rule edge tests**
- [ ] Needlesong: real eligible cut only, refresh not stack, expiration restores correct base speed, forecast updates immediately.
- [ ] Glass Lantern: exact/grazing boundary, enter/exit in one tick, moving halo, multiple bolts; visible halo matches rule. Beam unaffected.
- [ ] Long Silk / Short Stitch: capacity and speed update at safe checkpoint; never truncate live path. Verify a real situation where each loses an opportunity.
- [ ] Mourning Bell: two distinct direct dash kills, once-only arrival burst, no burst recursion, no empty-loop charge.
- [ ] Traveler’s Knot: at most one unspent mark or active decoy; consumed at NEW aim lock; warning stays at that location after decoy disappears. Existing warning/fired bolt never retargets.
- [ ] Shared: state survives save/retry; replacing relic removes obsolete modifiers without erasing earned unrelated progress; invalid/excluded loaded pair recovers safely.

Fourteen legal pairs cover equipped combinations, **not all timing/room/starter states**. Run representative full expeditions and targeted adversarial fixtures too.

## 7. Rooms, boss, strategy and equal category gates

- [ ] Both starters can complete every authored template and boss without a mandatory randomly unavailable relic.
- [ ] Needler/body aim, Keeper/soul aim and Warden/guard each teach alone before pairings.
- [ ] No attacks spawn directly on soul, no new wall traps a live route, no required pickup is unreachable.
- [ ] Every room has a complete entry/teach-or-combat/reward/exit/failure loop; retry clears state.
- [ ] Boss reuses clear patterns; remix increases interaction, not visual noise or undocumented immunity.
- [ ] Verify branch/draft RNG constraints; choose an authored fallback for invalid content rather than ship unverified generation.
- [ ] Two starts have viable sidegrade tradeoffs, not one superior unlocked version.
- [ ] Same-room test shows interception build deliberately changing bolt/arrival timing; long-thread build taking a meaningful flank; reunion build choosing target order/meeting point.
- [ ] Compare baseline “kill shooter first,” repeated short out-and-back attack, always RETURN and maximum chaining. No policy should trivialize every encounter.
- [ ] Long Silk’s slower soul actually loses a safe timing or position somewhere; extra reach cannot be a free upgrade.
- [ ] Run duration is measured without forced idle/walking padding; a complete ending exists.

**Fun:** observe first useful action, comprehension, accidental inputs, failure explanation, voluntary retry and changed strategy. Do not coach then claim onboarding passed.

**Visual:** inspect phone still and silent live clip. Body/soul/ribbon, hazards/warnings, safe floor and objectives must read immediately; strong material/color identity must survive action. No confusing red “danger ribbon” if ribbon is harmless. Muted/reduced-motion play stays legible.

**Theme:** ask what changes with the two speeds before naming “Speed.” Equal-speed comparison should remove central route decisions, not merely shorten animation.

**Depth:** record decisions changed across builds/branches and a returning saved session. Hours/days of engagement remain unproven until longitudinal observation; counters, cosmetics and seed count are not evidence.

## 8. Room-entry save and local progression

Baseline is **checkpoint restart of current room**, not exact mid-room continuation.

**Lifecycle distinction:** background/lock with the browser process still alive cancels input and pauses the existing state; explicit Resume continues that exact in-memory state. Reload or process loss instead restores the room-entry checkpoint through Continue. Test both separately; a simple tab switch must not discard the current room.

- [ ] **SAVE-01** Fresh/empty storage starts correctly; “Continue restarts this room” is visible before reliance on it.
- [ ] **SAVE-02** Checkpoint stores schema/rules/content versions, room/template/branch, starter and equipped relics, RNG state, resolved draft choice, entry health/resources, completed rewards/unlocks and settings.
- [ ] **SAVE-03** Reload after aiming/hit/dash/return/boss phase restores the declared room-entry state, not a partial mixture. Uncommitted pointer input is canceled.
- [ ] **SAVE-04** Reload before/after draft or reward cannot reroll a claimed consistent seed, duplicate a reward, spend twice or lose prior-room completion.
- [ ] **SAVE-05** Checkpoint/reward update is one logical transaction; preserve previous valid save until new state validates.
- [ ] **SAVE-06** Old version, malformed JSON, unknown IDs, excluded pair, invalid ranges and partially written state offer safe recovery. Migration preserves previous valid data until successful.
- [ ] **SAVE-07** Unavailable/quota-denied/private storage does not crash play; display nonpersistent status honestly. Do not promise cross-device or permanent storage.
- [ ] **SAVE-08** Muting/reduced-motion/settings persist appropriately; new run does not accidentally erase unlocked discoveries.
- [ ] **SAVE-09** Repeated death/retry/reload gives a coherent checkpoint policy. Avoid fragile anti-cheat work; do not conceal reset semantics.
- [ ] **SAVE-10** Complete then return later: prior progress and lateral starts work; original starter remains viable.

If exact mid-room save is later implemented, add full ordered tether/cursors, both actor states, attack IDs/timers/projectiles, grace/boost/charges, RNG and pending committed action snapshot at a consistent tick boundary. Test hash equality. Endpoint-only serialization is insufficient and must never be advertised as exact resume.

## 9. Art integration, device lifecycle and proposed budgets

**First asset gate:** one Blender GLB/glTF actor and one orthographic room, actual phone, before bulk models. Verify world-unit scale, foot/soul pivots, transforms, clip naming, state transitions and shadows against the 2D ground plane. Visual animation cannot move collision origin or alter damage windows.

- [ ] Art/3D projection maps input correctly across screen sizes and camera settings; no height-driven picking ambiguity.
- [ ] Body, soul and telegraphs remain visible behind tall scenery; no required hidden path or camera rotation.
- [ ] Material/texture/geometry budgets recorded from the actual art pipeline. Inspect decoded texture and GPU costs; file compression alone is not memory evidence.
- [ ] Transparency, silhouette, floor contact, shadow direction and outline treatment stay consistent across assets.
- [ ] Reduced motion removes shake/excess trails, not vulnerability or timing information.
- [ ] If renderer budget fails: reduce dynamic shadows/materials/effects, then approved Blender prerender fallback; retest touch/projection and readability.

**Required matrix**
| Surface | Checks |
|---|---|
| Actual iOS Safari | Cold load, audio gesture, touch, safe areas/address bar, background/lock, memory pressure, continue/retry |
| Actual Android Chrome | Same checks, including lower/mid-range reference if available |
| 360×640 CSS viewport and taller portrait | No cropped actions/HUD, readable text, comfortable relative aim |
| Desktop Chrome and Firefox | Mouse/keyboard, resize, refresh, pause; supplementary only |
| itch.io iframe and direct build | Sizing, focus, audio, storage, loading, fullscreen if offered, back/reload |
| Interrupted flows | Second pointer, browser swipe, orientation change, pointercancel, tab switch, device lock, background during load/draft/return |
| Audio | First gesture starts; denied/suspended audio nonfatal; mute persists; resume no burst; essential cues also visual |

If a device is unavailable, record **BLOCKED — exact device/test and access needed**, not “mobile tested.”

**Initial budgets, all unmeasured and subject to named-device validation**
| Metric | Proposed target / reporting requirement |
|---|---|
| Critical compressed transfer | ≤4MB first-play payload; ≤10MB optional full content |
| Cold first usable action | ≤5s under recorded ~10Mbps/100ms profile; disclose device/cache/network |
| Frame pacing | Aim 60fps, p95 frame time ≤20ms on named reference phone; stable 30fps fallback only if feel stays fair |
| Input feedback | Visible selection/preview ≤100ms under representative load; report method |
| Rules step | p95 ≤2ms at maximum supported state on reference device |
| Decoded texture memory | Initial target ≤32MiB; art worker may refine with measured evidence |
| Save | Compact checkpoint target ≤100KiB; no frames/images in state |
| Stress | 20-minute play, max supported entities/bolts, repeated restarts/background cycles; no unbounded memory/queue growth |

Report actual scene complexity, render resolution/device pixel ratio, device/browser, sample duration, percentiles and thermal trend. A desktop FPS number does not establish phone performance. Do not delete core readability to meet a decorative-effects budget.

## 10. Exact-upload release checklist

Reserve **31 October 09:00–15:00 UTC** for QA, packaging and contingency. No new mechanics in that window.

Target actual authorized submission by **12:00 UTC / 17:30 IST**: release-gating QA 09:00–11:00, package/submit 11:00–12:00, post-upload verification and any critical pre-cutoff fixes 12:00–14:00, final contingency/verification 14:00–15:00. Any replaced build must repeat affected regressions and exact-upload smoke checks; submission status alone is not a final QA pass.

- [ ] Build ID/commit and rules/content version visible in diagnostics; final distributable archived.
- [ ] Production package contains required files, correct paths/case and local assets; no live external API or authenticated asset dependency.
- [ ] Load from a fresh browser/cache and the **actual uploaded itch.io embed**, not only localhost.
- [ ] Start, play, lose/retry, draft, checkpoint/reload and complete a run from the uploaded build.
- [ ] Repeat actual iOS/Android smoke checks on uploaded version, including audio and storage.
- [ ] No unresolved P0/P1; record blocked/not-run checks honestly. Fixes trigger affected regression plus core smoke.
- [ ] Credits, asset rights and actual AI/Blender/tool usage disclosures complete; no claim concept art is a screenshot.
- [ ] Page description reflects shipped scope, checkpoint behavior and controls; no future-feature claims.
- [ ] Entrant identity, jam association, visibility and correct build verified through authorized submission workflow. Do not publish/change account settings without authority.
- [ ] Final entry link opens for its intended audience; correct title/build associated with jam.
- [ ] Verify before **31 October 15:00 UTC / 20:30 IST**; retain evidence and backup. No post-deadline update assumed.

**Signoff format:** “Build ___ tested on ___; passed ___; failed ___; blocked/not run ___; submission verified at ___ UTC.” Do not replace evidence with “looks good” or promise scores.

## Reference documentation

Implementation choices should be checked against current primary documentation when built: [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [Web Audio practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [browser storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). These explain browser constraints; they do not validate this game.


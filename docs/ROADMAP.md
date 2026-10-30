# OUTRUN YOUR SOUL — Delivery Roadmap

**Planning baseline:** 30 October 2026, 13:55 UTC. **Deadline:** 31 October 2026, 15:00 UTC / 20:30 IST. Approximately 25 hours remain. This is a plan, not a record of implemented features, passing tests, measured performance or proven retention.

Deliver a portrait HTML5 touch game through itch.io. Fun, Visual Appeal and Theme Following are equally important; strength in one does not excuse failure in another. Speed must create the decisions, not merely decorate a timer. [Official jam rules](https://slapjam.ai/) · [Jam page](https://itch.io/jam/slapjam-ai-2)

## 1. Product and non-negotiable rules

A dead courier escapes a funeral railway with a fast body and a slower vulnerable soul. A compact room-based action roguelite combines route choices, finite health, lateral relic builds and a complete ending. Not an endless runner, passive survival arena or future-feature demo.

- Outward dash is finite-speed movement, lays navigable tether and can strike enemies/cut eligible projectiles. Only the **body during dash travel** is protected. Aim, recovery, waiting and RETURN are vulnerable; the soul never inherits dash protection.
- Soul follows the stored path at a slower spatial speed, not a fixed time-delayed replay. Ribbon is a forecast, **not a damage hitbox**. Only body and soul take shared-health damage.
- RETURN consumes the existing route backward from the body end while the soul consumes the head. It follows corners, works while the tether is taut, does not attack/cut projectiles and grants no protection.
- Genuine swept body–soul contact after separation clears the remaining tether, including loops. It ends an outward dash immediately and enters recovery; preview shows this endpoint. Crossing only the ribbon does nothing.
- Radius contact anchors both centers at the body’s position at contact time. The soul’s bounded remaining gap (at most combined radii plus tolerance) must have a wall-clear full-radius swept corridor and final footprint; otherwise keep following the route. Sweep hazards across that local snap at the event time: earlier hits stand, ordinary dedup/grace applies, and reunion grants no new immunity.
- Arm contact after separation beyond combined radii plus tolerance; starting co-located must not cancel departure. Ordinary route exhaustion always reunites. Arrival effects trigger once per separated-to-reunited transition.
- Walls are static during encounters. No route simplification through walls; no closing door across a live route. Exit requires body and soul reunited.
- One attack ID cannot damage both endpoints twice. Brief global damage grace is distinct from dash protection. Beam activations receive separate IDs, so later pulses remain dangerous.
- Resolve swept collision by actual event time, including cut-versus-soul-hit and contact ending immunity. Document exact-tie policy; never let entity iteration order decide.
- Locked warning lines do not retarget. Killing a source suppresses future attacks, not already-fired projectiles.
- Relative drag/release previews outward movement; a short tap that never armed aim invokes RETURN. Returning a drag to its dead zone cancels, not RETURN. Long stationary press does nothing. Canceled/interrupted pointers cancel and pause. Normal aim does not pause enemies or soul.
- Room-entry checkpoints are baseline: label **“Continue restarts this room.”** Persist previous completed rooms, RNG/draft decisions, unlocks/settings and rewards exactly once. Exact mid-room resume is not required or implied.
- Lifecycle distinction: backgrounding while the process remains alive cancels input and pauses the current in-memory state; explicit Resume continues that same state. Reload or browser-process loss uses Continue and restores the room-entry checkpoint. Do not restart a room merely because the phone was briefly locked.

Illustrative, **untested** tuning: dash ≤3 tiles at 15 tiles/s; soul 2 tiles/s; recovery ~0.15s; outstanding tether ≤6 tiles. A proposed 64-vertex cap also needs validation. Treat these as starting parameters, not final balance or required reaction times.

## 2. Submitted-game baseline

| Area | Baseline |
|---|---|
| Enemies | Three roles: Needler locks bolts toward body; Keeper locks bolts toward soul; Warden has frontal protection and announced openings |
| Hazard | A distinct persistent environmental lane, not a cuttable projectile or fourth enemy role |
| Rooms | Six authored, validated templates supporting a small branching expedition; not a promise of six unique combat rooms in every run |
| Boss | One final warden using two familiar patterns plus a remix/escalation; reuse follower machinery only if stable |
| Builds | Three route-changing families: interception/arrival timing, reach versus lag, earned reunion placement |
| Relics | Six candidate rules; two equipped slots maximum; fourteen legal unordered pairs and one excluded pair |
| Starters | Two sidegrade starts drawn from the same relic pool; no permanent damage inflation |
| Progress | Room-entry save, completed-run records, lateral unlocks and a small discovery atlas |
| Presentation | Coherent sunlit cobalt/ivory/vermilion/gold 2.5D railway courtyard; legible body/soul/harmless ribbon and distinct attack telegraphs |
| Run | Complete victory/defeat/retry arc; 10–15-minute target is unmeasured and must not be manufactured with waiting |

Six relic rules to preserve:
1. **Needlesong:** cutting a real hostile bolt briefly accelerates soul; refresh, never stack, boost. Earlier arrival can be worse.
2. **Glass Lantern:** bolts slow within a visible soul halo, regain speed outside; no beam protection. Slower bolts can obstruct RETURN longer.
3. **Long Silk:** +2 tiles capacity, soul 20% slower.
4. **Short Stitch:** less capacity, faster soul; mutually exclusive with Long Silk.
5. **Mourning Bell:** two distinct direct outward-dash kills charge one burst at next reunion. Consume once; burst kills never recharge.
6. **Traveler’s Knot:** direct outward-dash kill earns one reunion decoy affecting only the next NEW aim acquisition; consume at aim lock, retain locked line. It never retargets an existing warning/bolt and does not block the shot.

Drafts/replacements happen only at reunited safe checkpoints. No duplicate stacks, third slot, empty-movement farming, burst-trigger cascades or silent truncation when replacing a capacity relic.

## 3. Critical path and dependencies

**Rules/asset contract → polished phone encounter → complete run/checkpoint → content/build validation → release candidate → exact-upload QA → submission verification.**

Parallel work is useful only after interfaces agree:

| Track | Owns | Dependency / handoff |
|---|---|---|
| Engineering | Deterministic 2D model, input, sweeps, deque, UI, saves, browser packaging | Stable state/event IDs, room coordinates, actor scale and collision origins |
| Blender MCP / art | Low-poly models, consistent orthographic camera/light/materials, GLB/glTF assets and visual-state clips | Written export contract; first approved phone composition before bulk asset production |
| Encounter/design | Fair route situations, authored templates, relic tradeoffs, teaching | Uses actual movement/timing model; no independent “close enough” simulation |
| QA/release | Evidence log, phone/iframe checks, regressions, final package | Exact build ID, seed/command reproduction, available target devices |

Chosen presentation baseline: **Three.js low-poly orthographic live 3D over deterministic 2D authoritative gameplay**. There is no 3D physics or rope simulation. Validate one Blender actor plus one room on a real phone before bulk assets. If load, frame-time or readability budgets fail, reduce materials, shadows and effects first; then use Blender-prerendered sprites with the same 2D rules/input contract. Do not spend the QA reserve defending an expensive renderer.

Freeze an asset contract early: world-unit scale, camera/projection, orientation, GLB/glTF conventions, actor foot/soul pivots, transforms, clip/state names, material and texture limits, shadow handling, material palette and collision geometry separate from art. For sprite fallback, also specify transparent bounds, rendered frame dimensions/naming and atlas ownership. Share one sample actor and courtyard tile first. Art changes must not move hitboxes or alter simulation timing. Keep source/license/tool records for credits and truthful AI-tool disclosure.

## 4. Timebox from now — estimates, not promises

These are **elapsed calendar windows**, not guaranteed labor hours. Parallel tracks overlap; do not add them as person-hours. Staffing, device access, rest and recoverable failures consume this allowance. Reassess at each gate; never quietly borrow the final QA reserve.

| UTC window | Focus | Acceptance before proceeding |
|---|---|---|
| Oct 30 13:55–14:30 (~35m) | Assign owners, confirm engine/deploy path and phones; freeze rules/asset interface | [ ] Browser skeleton path and target devices named; [ ] first art sample contract agreed; [ ] test evidence template ready |
| 14:30–17:30 (~3h) | **One polished phone encounter**, not a wide graybox campaign | [ ] Dash/RETURN/contact/telegraphs visible and satisfying; [ ] actual-phone input; [ ] sound after gesture; [ ] one beautiful coherent scene; [ ] safe failure/retry and reunion exit |
| 17:30 decision | Pass/fix/rethink core | [ ] All three category gates below pass provisionally; otherwise stop breadth and repair core |
| 17:30–21:30 (~4h) | Complete-run spine, three roles, room transitions, checkpoint, first draft; parallel production art | [ ] A beginning-to-ending route exists; [ ] reload is honest/idempotent; [ ] all enemy roles teachable; [ ] art swaps preserve behavior |
| 21:30–Oct 31 02:00 (~4.5h) | Authored rooms, six relic candidates, two starts, boss reuse; integration and rest/handoff allowance | [ ] Every addition has tests; [ ] no placeholder future menus; [ ] reject effects that violate rules |
| 02:00–06:00 (~4h) | Complete-build play, pair/room matrix, polish, pacing, recovery allowance | [ ] Different builds change same-room decisions; [ ] both starters viable; [ ] no forced idle padding |
| 06:00–09:00 (~3h) | Resolve critical issues; trim unreliable breadth; freeze candidate | [ ] Release candidate and version recorded; [ ] assets/credits included; [ ] no known P0/P1; [ ] scope disclosure accurate |
| **09:00–11:00 (2h protected)** | **Release-gating device, persistence, content and performance QA** | [ ] Critical test evidence completed; [ ] rerun affected checks after every fix |
| **11:00–12:00 (1h protected)** | **Authorized packaging and actual submission by 12:00 UTC / 17:30 IST** | [ ] Uploaded build plays from final URL; [ ] correct jam entry, metadata/tools/credits verified |
| **12:00–14:00 (2h protected)** | **Post-upload exact-build QA and critical fixes if needed** | [ ] Continue device/regression checks; [ ] any permitted pre-cutoff replacement is reuploaded and reverified, including jam association |
| **14:00–15:00 (1h protected)** | **Contingency and final submission verification** | [ ] Correct latest entry/build visible; [ ] backup retained; [ ] no planned feature work |

The actual submission target is **12:00 UTC / 17:30 IST**, leaving a three-hour buffer before the 15:00 UTC cutoff. Post-upload QA may continue and critical replacements may occur only while permitted before cutoff; every replacement needs exact-build verification. No post-cutoff fix is assumed. An upload is not proof of a correct jam submission.

## 5. First polished encounter: decision gate

Do this before manufacturing six rooms or twelve speculative effects.

**Fun**
- [ ] A fresh player performs a meaningful action within ~10s and understands the central tradeoff within ~30s, without spoken coaching.
- [ ] Input does not repeatedly confuse dash, cancel and RETURN.
- [ ] A failure can be explained by the player; retry is immediate.
- [ ] Chaining, safe flank, offensive contact dash and vulnerable RETURN each have a situational reason; “dash once, return forever” is not the sole safe policy.
- [ ] Full-tether threats leave a real response for ordinary touch play, not obligatory twitch interception.

**Visual Appeal**
- [ ] One phone-scale still and a silent 5–10s clip distinguish body, soul, harmless ribbon, active hazard, warning and safe floor.
- [ ] Art direction is coherent and attractive in motion, not just a Blender render.
- [ ] Finger occlusion, reduced motion and muted play retain essential information.
- [ ] Hit, cut, separation and reunion each have crisp, different feedback.

**Theme Following**
- [ ] Players notice the two movement speeds before being told the theme.
- [ ] Equalizing body and soul speeds removes a central route dilemma.
- [ ] More speed can both help and expose; it is not just a countdown or animation rate.

**Disposition:** pass provisionally and expand; hold and fix; or reject/rework the core. No averaged score may cancel a failed category. Record observations and limitations, not invented ratings.

## 6. Scope tiers and cut order

**Tier A — baseline above:** six templates, three roles, six relics/two slots, two starters, one complete boss/run, local progress. This remains an ambitious target, not completed scope.

**Tier B — preserve the game, reduce production breadth:** fewer decorative variants/animation frames, one environment kit, smaller atlas, no optional contracts/daily seed; reuse validated room geometry and familiar boss patterns. Keep baseline strategy families and complete ending. This is the first cut, not visual abandonment: concentrate polish on the visible main scene and feedback.

**Tier C — explicit emergency reduced entry:** if content cannot be validated, cut to fewer authored encounter templates and a smaller tested relic pool while retaining three genuinely distinct route strategies, a complete expedition, two meaningful starts if viable, save/retry and coherent art. Remove broken choices rather than display locks promising future depth. Re-run the category and same-room-divergence gates. **If the smaller pool cannot retain the depth requirement, report that gap and seek a scope decision; do not claim the original brief is met.**

Never cut touch reliability, collision fairness, warning clarity, core two-speed distinction, visible outcomes, complete ending, honest saves or final device QA to inflate content count. Do not “save time” by returning to invulnerable RETURN, vulnerable ribbon or a fixed-delay soul; those are different designs.

Later ambition, **not jam evidence**: additional regions/bosses, more roles, 9–12+ relics, larger atlas/contracts, precise mid-room persistence, online services. Accounts, leaderboards, unrestricted procedural generation, dynamic walls and rope physics are not on the critical path.

## 7. Depth and delivery evidence

- Minute one: understand protecting a lagging endpoint and choose a route.
- First run: learn roles, make a real draft/branch choice, finish or fail fairly.
- Hour one: same room invites different routes with interception, reach and reunion builds.
- Later sessions: reliable saved progression and lateral starts support revisiting; no mandatory grind or daily lockout.
- Days-long engagement is unproven until observed. Seed counts, theoretical combinations and elapsed run time are not retention evidence.

Maintain one issue log ordered by damage to **Fun / Visual / Theme** and technical severity. Required evidence: build ID, device/browser, test/seed, observation, pass/fail/blocked/not-run, next action. Use [TEST_PLAN.md](TEST_PLAN.md). No release-ready claim while critical checks are blocked.

**Current planning blockers to resolve, not assumed failures:** exact target phone access, validated Three.js/Blender export pipeline, runnable build and measured core feel are not established by this roadmap. Owner must record their actual status before ticking gates.


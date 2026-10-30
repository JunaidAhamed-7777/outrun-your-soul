# Content and expedition design — OUTRUN YOUR SOUL

**Status:** baseline content plan and falsifiable design hypotheses, not completed assets or balanced encounters. Combat semantics are owned by [COMBAT_SPEC.md](COMBAT_SPEC.md); fantasy and presentation by [GAME_DESIGN.md](GAME_DESIGN.md).

## Delivery envelope

- **Three enemy roles.**
- **Six ordinary-room templates in a selection pool, plus one separate boss arena.** This is not six guaranteed unique combat encounters per run.
- **One boss:** two familiar patterns plus a remix escalation.
- **Six relics and two equipped slots total, including the starter relic.**
- **Two starting kits** assembled from the same pool.
- One complete branching expedition, local atlas, settings and room-entry checkpoints.

A provisional route graph is opening encounter → choose a branch encounter → safe station → choose another branch encounter → final approach → boss → ending. It may visit four regular encounters selected from the six-template pool, plus the boss and brief noncombat choices. Validate the graph and pacing before advertising a fixed duration. Target 10–15 minutes without padding; iteration may change encounter count while preserving a complete arc.

## Enemy roles

| Role | Pressure | Readable counterplay | Protected constraint |
| --- | --- | --- | --- |
| Needler | Aimed bolt locks toward the body. | Move before lock, interrupt an unlaunched attack, or cut the launched bolt. | After lock, aim remains honest; source death does not erase the fired bolt. |
| Keeper | Aimed bolt locks toward the slower soul. | Plan the soul's route, rescue by interception, or use a safe reunion. | Telegraph near the threatened endpoint; do not create an unavoidable committed-route hit. |
| Warden | Frontal protection and a signaled opening. | Off-angle approach or timed chain through an actual opening. | Same visible guard rules throughout the game; no surprise final-frame immunity. |

Environmental lanes are separate room hazards, not a fourth enemy role. They must look and sound different from cuttable bolts. All roles need distinct silhouettes and state animations even when built from a shared Blender kit.

## Six room-template proposals

These names and layouts are production proposals, not proven fair rooms. Build collision proxies and test the decision before finishing its models.

| Template | Main spatial question | Intended decision signature | Validation obligation |
| --- | --- | --- | --- |
| Departure Court | Open safe space and an obvious exit. | Learn dash, slow follower, vulnerable RETURN and reunion. | First thirty seconds work without mandatory damage or a lecture. |
| Needle Gallery | Cover splits a straight firing line from a longer flank. | Remove the source now or keep it alive briefly to exploit an interception. | Baseline and Threadkeeper must sometimes choose a different order. |
| Silk Cloister | U-shaped wall makes endpoints close in straight-line distance but far along their route. | Contact shortcut versus legal corner-following RETURN. | Neither preview nor soul/return traversal clips the wall. |
| Glass Crossing | A telegraphed environmental lane intersects a route. | Fast body crossing versus later soul exposure; safe detour or carefully timed shortcut. | Lane remains distinct from cuttable bolts and has a genuinely available safe plan. |
| Mourner's Garden | Outer targets surround a guarded center. | Earn limited charge and select a meaningful reunion point. | Charged reunion is useful but does not create an automatic burst chain. |
| Last Platform | Familiar roles combine around cover and a limited opening. | Preserve rescue capacity or commit to a longer chain. | Both starters can finish; no exclusive relic is required. |

Each template needs explicit spawn anchors, walls, entry/exit zones, allowed enemy combinations, hazard timing and an authored safe fallback. Variants should change target priority, cover use or timing—not merely rotate decorations.

Do not claim a general procedural solver. Use bounded authored variants, reject invalid data, and fall back to a tested setup. Archive problematic configurations for regression tests. A completion witness alone does not prove a room is interesting or fair.

## Boss: the Last Warden

The final enemy reflects the player's flaw: a fast armored body and a slower vulnerable heart/soul. The player chooses whether to chase the body or exploit the trailing weakness while still protecting their own soul.

Use two learned pattern families, such as a telegraphed commitment followed by a trailing-heart opportunity and a familiar aimed attack that pressures the player's endpoints. Escalation recombines those patterns rather than adding a new input or physics system.

Reuse the proven follower machinery where feasible. The boss arena is separate from the six ordinary templates. The final phase must remain readable, and a complete win, loss and restart must be tested. If the mirrored follower destabilizes the implementation, preserve a complete fair climax before adding extra phase complexity.

## Build loadout and six-rule candidate pool

**Two equipped slots maximum.** A starter supplies one relic; the first earned draft fills the second. A later station offers keep-or-replace, not a third slot. The player never collects the entire pool in one run. Two starters reuse this pool; additional starts are stretch.

The following are candidate rules for the six-effect scope, not a promise that every effect is already balanced:

| Relic | Exact rule hypothesis | Strategic cost or failure case |
| --- | --- | --- |
| Needlesong | Cutting a real hostile projectile briefly multiplies soul speed on its existing path; refresh rather than stack the boost. | Earlier arrival may hit a beam that slow arrival would avoid; empty swings grant nothing. Update the path/arrival cue immediately. |
| Glass Lantern | Hostile bolts move more slowly within a small visible halo around the soul, returning to normal speed outside it. | Does not stop environmental beams, guards, or body-targeted danger elsewhere. A slowed bolt occupies its lane longer and can make RETURN more dangerous. |
| Long Silk | Add two tiles of maximum thread; reduce soul speed by twenty percent. | Longer vulnerable backlog and return; taking the flank may sacrifice a narrow safe-crossing window. |
| Short Stitch | Reduce maximum thread and increase soul speed. | Reunites sooner but cannot reach some wide flanks without an extra stop or alternate route. Mutually exclusive with Long Silk. |
| Mourning Bell | Two direct outward-dash kills charge one burst at the next reunion; consume the charge at the meeting point. | Burst kills do not earn new charge. Returning at the wrong location wastes the opportunity. |
| Traveler's Knot | A direct outward-dash kill earns one decoy at the next reunion. It affects only the next NEW aim acquisition and is consumed when that aim locks. | Never retarget a locked warning or fired bolt. The locked line remains aimed at the consumed decoy's location. It does not block the shot; empty loops grant no decoy. |

All kill-triggered charges use distinct enemy IDs, have a small explicit cap, and cannot be earned by triggered bursts or decoys. Return travel itself remains vulnerable and non-attacking. Mourning Bell is an explicit earned **arrival** effect, never a damaging return sweep.

### Synergies and anti-synergies to test

- **Needlesong + Glass Lantern:** slower approach of a bolt may create a readable interception opportunity, then the cut speeds the soul onward. It must not trivialize persistent beams.
- **Long Silk + Traveler's Knot:** a flank can earn a decoy that redirects the next aimed attack after a safe reunion, supporting a new departure. It does not make the long return safe retroactively.
- **Short Stitch + Mourning Bell:** quicker reunion can place an earned burst deliberately, but reduced reach limits which two enemies can supply the charge.

Counter-interactions matter too: Needlesong can spoil a deliberately slow Long Silk arrival; Traveler's Knot attracts a bolt to the same meeting point where Mourning Bell rewards proximity; Long Silk and Short Stitch are excluded rather than stacked into an accidental universal upgrade.

There are fourteen legal unordered pairs and one explicit rejected pair, Long Silk + Short Stitch. Every legal pair needs a concrete encounter check. Six names and theoretical combinations are not proof of strategic depth.

Drafts and replacements happen only at reunited safe checkpoints. A smaller thread relic must never truncate a live path. Glass Lantern needs deterministic halo-entry/exit behavior and grazing tests; its visible boundary must match the actual speed transition. Traveler's Knot retains at most one unspent mark or active decoy; consuming a lure must not erase the already locked warning line.

## Three build strategies and their counterexamples

### Threadkeeper: protect by intercepting

A successful cut of a genuine hostile projectile briefly accelerates the soul along its existing route. This rewards choosing a short approach where a bolt can be intercepted before the soul reaches a dangerous crossing.

**Counterexample:** acceleration can carry the soul into a currently active environmental lane earlier than intended. Against an enemy with no cuttable projectiles, this build cannot assume a free speed boost.

### Long Silk: exploit spatial reach

A larger maximum thread budget is paired with a slower soul. The body can take a wide flank behind a guarded target or chain farther, while the slow endpoint remains exposed longer.

**Counterexample:** narrow crossings with recurring beams and no safe return corridor punish the longer backlog. This is not a strictly better upgrade.

### Mourner: choose where reunion happens

Distinct enemy defeats earn finite seals. A reunion may consume two seals to release one visible burst at the meeting point. No seals come from movement, waiting, or re-killing a respawned farm target.

**Counterexample:** an early safe reunion can waste the burst away from enemies; chasing a perfect meeting point may leave the soul exposed. Base return still does no damage during travel. This is an explicit conditional arrival effect, not hidden offensive return.

### Same-room divergence test

Use an L-cover room with a projectile source, two vulnerable outer targets, and a centrally guarded warden.

- Threadkeeper should have a reason to bait and cut the source's bolt to alter the soul's arrival.
- Long Silk should have a reason to bypass that exchange and take the long rear flank.
- Mourner should have a reason to defeat outer targets and arrange a charged reunion near the warden's next opening.

The baseline may remove the archer first to prevent future shots; an interception build may intentionally keep it alive briefly to use a telegraphed bolt. A long-thread build must demonstrate a flank that the baseline cannot afford at the same opening, not merely a cosmetically longer line. A charged-reunion build must sometimes defeat two outer targets before the central threat rather than following baseline priority.

**Long Silk counter-test:** show a crossing where the baseline soul clears a lane before a beam activates, while the slower soul arrives during the beam. Returning can save Long Silk, but must sacrifice the attack opening or position; otherwise its supposed cost may be irrelevant. This is a required balancing test, not a validated claim.

If playtesting shows all three choose the same target order and path, these are not meaningfully different builds and must be redesigned. The description is a falsifiable test, not evidence that balance is solved.

## Starter and draft progression

Two starters reuse approved relics; they do not add hidden third-slot passives. A practical initial proposal is a Threadkeeper start with Needlesong and a reach-focused start with Long Silk. These starter identities are subject to full-run viability tests.

The first earned draft fills the empty slot. Later station choices keep or replace an equipped relic. Long Silk and Short Stitch cannot coexist; a swap occurs only while reunited at a safe checkpoint. Never shrink capacity around a live tether.

Required coverage is six single-relic states, fourteen legal unordered pairs, the excluded-pair rejection, both starters through every template, and full representative runs. This is a test obligation, not a passed matrix.

## Across-day progression

The atlas can record completed branches, discovered relic rules, earned lateral starter access and completed mastery contracts. The starting kit remains viable. Avoid mandatory currency grinding for basic damage or health.

Later challenge modifiers should create a different plan: a smaller thread budget, changed cover anchors or a recombination of familiar target roles. Keep each modifier readable and validated. A new palette is not a new decision. Daily seeds, online scores and a broad campaign are stretch, not assumed retention.

Useful discovery goals include a clean interception, a deliberate wall-safe RETURN, a risky but successful chain and a well-placed charged reunion. Reward understanding rather than hours of repetition.

## Content data and asset boundaries

Give templates, enemy roles, relics, attacks and variants stable IDs. Keep gameplay values in validated content data, not in model dimensions or animation timing. Store render references separately from collision shape, target rule, warning duration and effect rule.

Each relic record should specify trigger, effect, cap, incompatible IDs, saved state, indicator and counterexample. Each room record should specify allowed roles, safe spawn anchors, objective, transition and known test configurations.

Blender models should share camera assumptions, scale, pivots and silhouette language. A visually ornate wall must still match a simple readable collision boundary. Use one coherent modular art kit across the template pool rather than treating six layouts as six separately modeled biomes.

## Expansion after evidence

Only expand toward six enemy roles, nine to twelve relics, further stations, additional bosses or a larger story after the complete baseline clears phone controls, encounter fairness, checkpoint and full-run tests.

Before adding content, demonstrate at least these route/order inversions in the same room:

- baseline removes a bolt source first, but an interception build deliberately leaves it alive for a useful cut;
- extended thread permits a flank unavailable under the baseline budget at the relevant opening;
- faster soul is safer at one crossing while slower soul permits a different useful delay elsewhere;
- a charged-reunion build chooses outer targets and a meeting location unlike habitual retreat.

If all builds use the same order and path, revise the rules. Six relic names and a theoretical combination count do not satisfy the intended hours-across-days experience.

## Authored templates (implementation record, 30 October 2026)

All playable rooms are 8 × 12 tiles with the gate at x 3..5 on the north wall and the spawn near (4, 1.5). Data lives in `src/content/rooms/`; `roomFor(templateId, variant)` in `src/content/rooms/index.ts` resolves the expedition's `(template, variant)` pair and falls back to variant 0. Variants share the template ID (saves and the expedition graph use template IDs) and differ in layout, schedule and display name. Every variant passes `validateRoom` and the fairness probes in `tests/content/fairness.test.ts`: an idle player is unharmed and nothing fires before 3 s; every lane is quiet for at least twice the time a soul needs to cross it, with at least 0.7 s of warning; no sentry stands in a lane.

| Template | Variant 0 | Variant 1 | Idea it tests |
|---|---|---|---|
| `departure_court` | Departure Court | (falls back to 0) | Teaching room: dash, slow follower, RETURN, gate needs both (authored by the simulation agent). |
| `needle_gallery` | Needle Gallery | Crossfire | Needler bolts aimed at the body fly on down the line the soul walks. Rush the gallery head between cover columns, or flank (the east flank wakes its own guard). Crossfire: two heads whose lines cross over a central block; cut one shot on the way to the other shooter. |
| `silk_cloister` | Silk Cloister (U) | Arcade (zigzag) | Close in a straight line, far along the thread. Contact through a wall is impossible, so it is RETURN round the corners, a legal outward chain, or the long walk. The pocket needler can only shoot out of the U's mouth. |
| `glass_crossing` | Glass Crossing | Two Panes | Lane timing for the slow endpoint. Two Panes: two lanes burn alternately with gaps on opposite sides; zigzag the gaps (thread-hungry) or time each pane. |
| `mourners_garden` | Graves | Vigil | Outer targets around a guarded centre. Until wardens exist the guard is geometry: a grave slab facing the spawn forces a flank. Vigil: an exposed centre keeper and four corner needlers waking in pairs. |
| `last_platform` | Platform | Long Chain | One limited opening in a platform wall. Platform: the opening holds a glass lane the soul must time. Long Chain: a one-tile gap under a keeper plus a far east gap; distant corner targets demand chains the soul pays for. |
| `last_warden` (boss) | The Last Warden (arena) | (none) | Open floor, four pillars and a full-width procession lane every route must time. **Placeholder enemies** (two escort waves of existing roles) until the boss mechanics ship. |

### Layouts

```
Needle Gallery     Crossfire          Silk Cloister (U)  Arcade
+--------+         +--------+         +--------+         +--------+
|k1 [EX] |         |   [EX] |         |n2 [EX] |         |   [EX] |
|   n1   |         |nw    ne|         |       k|         |      k1|
|        |         |#  k1  #|         |  #  #  |         |   #####|
|  #  #  |         |        |         |  #n1#  |         |n1    n2|
|  #  #  |         |   ##   |         |  #  #  |         |#####   |
|  #  # n|         |   ##   |         |  ####  |         |        |
|   S    |         |   S    |         |   S    |         |   S    |
+--------+         +--------+         +--------+         +--------+

Two Panes          Graves             Vigil              Platform
+--------+         +--------+         +--------+         +--------+
|k1 [EX] |         |   [EX] |         |nw[EX]ne|         |n1[EX] k|
|~~~~~~  |         |   n3   |         |  #  #  |         |   ##   |
|n2  # n1|         | #    # |         |   k1   |         |###~~###|
|  ~~~~~~|         |   k1   |         |  #  #  |         |        |
|        |         |n1 ## n2|         |sw    se|         |n2      |
|   S    |         |   S    |         |   S    |         |   S    |
+--------+         +--------+         +--------+         +--------+

Long Chain         The Last Warden
+--------+         +--------+
|nw[EX]ne|         |n1[EX]n2|
|   k1   |         |   k1   |
|### ### |         | #    # |
|        |         |~~~~~~~~|
|      s1|         | #    # |
|   S    |         |k2 S  n3|
+--------+         +--------+
```

### Pending warden layouts

`PENDING_WARDEN_ROOMS` in the registry holds `MOURNERS_GARDEN_WARDEN` (a warden at the centre facing the spawn, outer needlers, a keeper that wakes behind it) and `LAST_PLATFORM_WARDEN` (a warden behind the platform opening, facing it). They are **not playable**: the simulation still throws on wardens and `validateRoom` rejects them; a test asserts that the missing warden role is their only validation error. Enable them by appending to `ROOM_VARIANTS` once the warden role ships, then run the bot clears.

### Bot evidence (automated, seed 1)

Produced with `tests/content/navbot.ts`: the planning bot from `src/bot/bot.ts` with its `NOVICE_BOT` (0.4 s aim, 0.35 s reactions) and `EXPERT_BOT` (0.15 s / 0.15 s) profiles, candidate grid, stall pressure and reactive second ply, but scoring progress by **geodesic distance around walls** instead of straight-line distance. The stock straight-line bot is wall-blind: it clears every room except both Silk Cloister variants, where it parks against the wall nearest a target that is only reachable the long way round (last column). Each cell lists outcome, time, health, bolts fired, bolts cut, hits taken, RETURNs and contact reunions, then the kill order. `tests/content/bot-*.test.ts` enforce that both profiles clear every variant with health left and clean invariants.

| Room | Novice | Expert | Kill order differs | Stock bot (novice) |
|---|---|---|---|---|
| Departure Court | clear 9.3 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 1, contact 0; n1>n2>n3>k1 | clear 9.2 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 2, contact 1; n1>n2>n3>k1 | no | clear |
| Needle Gallery | clear 6.9 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 0, contact 1; n2>n1>k1 | clear 7.6 s, hp 5/5, fired 0, cut 0, hit 0, RETURN 0, contact 1; n2>n1>k1 | no | clear |
| Needle Gallery: Crossfire | clear 8.3 s, hp 5/5, fired 1, cut 1, hit 0, RETURN 0, contact 1; ne>k1>nw | clear 7.6 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 4, contact 0; ne>k1>nw | no | clear |
| Silk Cloister | clear 9.8 s, hp 5/5, fired 4, cut 0, hit 0, RETURN 1, contact 0; k1>n1>n2 | clear 11.3 s, hp 5/5, fired 3, cut 0, hit 0, RETURN 2, contact 2; k1>n2>n1 | yes | timeout |
| Silk Cloister: Arcade | clear 9.7 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 0, contact 3; n2>n1>k1 | clear 9.0 s, hp 5/5, fired 2, cut 0, hit 0, RETURN 1, contact 2; n2>n1>k1 | no | timeout |
| Glass Crossing | clear 8.6 s, hp 5/5, fired 2, cut 0, hit 0, RETURN 1, contact 0; n2>n1>k1 | clear 6.2 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 1, contact 1; n2>k1>n1 | yes | clear |
| Glass Crossing: Two Panes | clear 12.0 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 2, contact 1; n1>k1>n2 | clear 8.2 s, hp 5/5, fired 0, cut 0, hit 0, RETURN 0, contact 3; n1>n2>k1 | yes | clear |
| Mourner's Garden | clear 6.1 s, hp 5/5, fired 0, cut 0, hit 0, RETURN 1, contact 0; n2>k1>n1>n3 | clear 8.7 s, hp 5/5, fired 2, cut 0, hit 0, RETURN 0, contact 3; n2>k1>n1>n3 | no | clear |
| Mourner's Garden: Vigil | clear 11.7 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 1, contact 1; se>k1>sw>nw>ne | clear 12.1 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 2, contact 2; se>k1>sw>nw>ne | no | clear |
| Last Platform | clear 8.5 s, hp 5/5, fired 3, cut 1, hit 0, RETURN 1, contact 1; n2>k1>n1 | clear 11.3 s, hp 5/5, fired 3, cut 0, hit 0, RETURN 2, contact 1; n2>k1>n1 | no | clear |
| Last Platform: Long Chain | clear 9.6 s, hp 5/5, fired 2, cut 0, hit 0, RETURN 1, contact 1; s1>k1>nw>ne | clear 8.1 s, hp 5/5, fired 1, cut 0, hit 0, RETURN 4, contact 1; s1>k1>ne>nw | yes | clear |
| The Last Warden (placeholder) | clear 11.8 s, hp 5/5, fired 4, cut 1, hit 0, RETURN 0, contact 3; n3>k2>k1>n2>n1 | clear 10.1 s, hp 5/5, fired 4, cut 1, hit 0, RETURN 1, contact 3; n3>k2>k1>n2>n1 | no | clear |

**What this shows and does not show.** Every variant is winnable with novice-style aim delay; RETURN and contact reunions both occur across the pool; four variants produce different kill orders between the two timing profiles. That is timing divergence, not build divergence: relic behaviours are not in the simulation yet, so the same-room build-divergence test above remains **not run**. The bots never take damage because they aim perfectly and search ahead, which says nothing about human difficulty; that needs real play. Dormant enemies can be struck before they wake, so wake-on-kill "second waves" placed near the spawn (the Last Warden placeholder) are often cleared pre-emptively. That is acceptable for a placeholder and a known weakness to revisit with the boss. Numbers were measured before the simulation agent's keeper forecast-aim change; re-run them after that merges.


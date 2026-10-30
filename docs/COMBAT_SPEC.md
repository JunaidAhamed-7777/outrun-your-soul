# Combat specification — OUTRUN YOUR SOUL

**Normative rules, unvalidated tuning.** This is the implementation contract. The ribbon is a living navigable route, not a physics rope, fixed-delay replay or damage trail. See [GAME_DESIGN.md](GAME_DESIGN.md) for intent and [CONTENT.md](CONTENT.md) for data-driven content.

The implementation agent may tune centralized speed, distance, radius, warning, recovery and gesture-threshold parameters through testing. Changing endpoint-only damage, body-only dash protection, vulnerable non-offensive RETURN, genuine-contact reunion or the two-slot loadout is a design change, not numerical tuning. Record deliberate changes and their evidence rather than silently altering the contract.

## Exact provisional model

**Chosen model:** a slower spatial follower, not a fixed-delay video replay.

- Body movement is a finite-speed dash, not teleportation.
- Soul follows the committed navigable ribbon at a slower constant spatial speed.
- Outward movement appends to the route.
- Maximum outstanding ribbon length is finite; the endpoint preview stops before exceeding it.
- The ribbon is a forecast, **not a damage hitbox**. Only the body and soul can be hit.
- The body is protected only during dash travel. It is vulnerable while aiming, waiting, and recovering. The soul does not inherit that protection.
- The same dash sweep can cut an enemy or intercept a projectile. No second attack button.
- Walls truncate the preview and dash. The soul follows the same navigable path. Doors do not close across unconsumed ribbon.
- Extraction requires both body and soul; escape does not erase unpaid movement.
- A genuine physical body–soul contact is an intentional reunion shortcut. Mere contact with an old ribbon segment is not.

**Illustrative tuning only:** dash up to three tiles at fifteen tiles/second; soul at two tiles/second; recovery around 0.15 seconds; maximum ribbon six tiles. These numbers are not tested and are not promises.

## Active return rather than waiting

Without an active recovery option, two quick dashes could be followed by several seconds of boring waiting. The proposed fix makes the ribbon a living tether:

- A return action moves the body backward along the existing ribbon at finite speed, consuming it from the body end. This is living-tether retraction, not a new route appended to a historical replay.
- Body consumes route from its end while the soul consumes from the other.
- They reunite when they meet; no arbitrary shortcut through walls.
- Return traverses the actual curves of the route, so the player need not redraw it precisely.
- A reunion reward, if present, requires earned combat charge. Empty dash–return cycles cannot farm it.

**Control candidate:** relative drag and release to dash; a short tap to return. A return preview must be visually distinct from an outward dash preview. An alternative is aiming generally toward the soul and snapping to a visible return corridor; this may be more ambiguous. These are competing input designs, not two mandatory shipped schemes.

**Return is fully vulnerable, does not damage enemies, and does not cut projectiles.** Only outward dash travel has the offensive/protected sweep. Return is not an unconditional safety button. Its path and endpoint can be threatened, recovery still takes time, and repeatedly abandoning an attack window can lose a room objective.

## Contact reunion and the two return options

**Accepted rule:** after separation, genuine swept body–soul contact clears the remaining route, even if a loop remains. Contact ends an outward dash immediately; normal recovery still applies. The contact endpoint must be shown in the live preview so an intended strike is not unexpectedly truncated.

An offensive dash aimed backward still appends new movement and spends available capacity **until contact occurs**. It does not silently become a free offensive reel. RETURN instead consumes the existing route, can retract the entire outstanding length, follows corners automatically, and remains vulnerable and non-attacking.

Three planned tests establish the distinction:

| State | Offensive contact dash | RETURN |
| --- | --- | --- |
| Straight two-tile gap with four tiles of free capacity | Can reach the moving soul; protection and projectile cutting can make it the skilled choice. | Easier one-tap commitment, but vulnerable. |
| Five-tile gap with only one tile free | Cannot reach because of both range and capacity. | Can retract the full path even while nearly taut. |
| Six-tile U-shaped path around a wall; endpoints only two tiles apart | Direct shortcut is blocked by the wall. | Follows the legal corners and consumes the path. |

These are paper states, not validated encounters. Short out-and-back attacking loops may be a legitimate playstyle, but cannot dominate every room. Enemy timing, cover and limited reach must preserve reasons to chain, flank, intercept, and use vulnerable RETURN.

**Event safeguards:**

- Start co-located without immediately triggering reunion on departure. Arm contact only after actual separation beyond the combined collision radii plus a small tolerance.
- Ordinary route exhaustion always reunites, so a tiny accepted movement cannot strand an unarmed near-overlap state.
- Detect contact against the soul's moving position, piecewise through route corners—not only its final position in a frame.
- Only the separated-to-reunited transition can trigger arrival effects; consume earned charges once.
- Reunion is not healing or free invulnerability. If its position is dangerous, ordinary collision rules still apply.
- A loop crossing without endpoint contact does not erase debt.
- If contact truncates a protected dash near a projectile or beam, resolve actual event times consistently. Do not use entity array order to grant or remove safety.

The visual language must distinguish a sharp attacking slash laying fresh thread from an unarmed gathering return. Physical contact now means what it looks like: the two selves really meet.

## Input contract

Preferred first implementation candidate: relative drag/release for an outward dash; a short stationary tap for return.

- A gesture can begin in a comfortable open area, including the lower part of the screen. It controls a preview originating at the body; the finger need not cover the target.
- The preview respects maximum dash length, available tether, and the first wall collision.
- Once a gesture has crossed the aiming threshold, pulling it back into its starting dead zone cancels. It must not accidentally become a return.
- A short tap is eligible for return only if it never armed an outward aim.
- A long stationary press does nothing on release. Pointer cancellation, loss of focus, and browser interruption cancel input and pause rather than committing an action.
- An invalid endpoint displays a clear invalid preview and does not spend the action.
- Aiming does not move the body. Normal enemy/soul time continues outside explicit full pause.
- A small input buffer can preserve a release just before recovery ends, but the UI must show that the action is queued. Do not queue a chain of unseen moves.

Thresholds and buffer duration require device testing. The control contract is more important than any provisional pixel value.

### Pointer ownership and interruption

One active pointer owns the gesture. Extra fingers cannot duplicate an action. Pointer cancellation, lost capture, backgrounding and browser interruption cancel uncommitted intent and pause the game. Resume explicitly; never advance a long hidden-tab time gap or release a stale dash. Restrict page-scroll suppression to the play surface.

Use relative aiming from a comfortable touch area; keep the body and soul visible above the thumb. A buffered action is one visible intent, not an invisible input chain. Revalidate its endpoint when it executes because the soul continues moving while the player aims.

## Collision and fairness contract

1. Body and soul share health. One attack ID cannot deal damage twice by touching both endpoints or remaining overlapped over multiple frames.
2. Damage grants explicit brief global hit grace. This is not a hidden return invulnerability.
3. Outward dash cuts eligible hostile projectiles. Already-fired projectiles persist after their source dies; killing a source suppresses only attacks it has not yet launched.
4. Return does not attack, parry, or protect either endpoint. Its danger preview must remain visible.
5. Soul motion traverses queued segments continuously. Outward movement cannot phase through walls, and return cannot cut a corner across them.
6. Walls are static during an encounter. No door may close across the unconsumed route; exits activate only after reunion.
7. Persistent environmental lanes are distinct from cuttable projectiles by shape, animation, and audio. Do not make visually identical threats follow different rules.
8. New attacks must leave an actually available response. A flashing warning does not excuse an already committed unavoidable soul hit.
9. Sparse legible encounters are preferable to bullet density. Basic survival should use route selection; interception is skillful recovery, not a compulsory twitch test.
10. Real-device testing must cover worst-case full-tether states, vulnerable return, overlap damage, and interrupted gestures.

All timings below are paper examples, not validated difficulty settings. Default attacks must be announced early and afford phone input. Include human aiming time, not just animation time, in every fairness trace.

Continuous beams use a fresh attack ID for each activation window. One hit must not grant permanent immunity to that beam in later cycles. Within a simulation step, compare actual contact times: an earlier projectile cut prevents a later soul hit, but a hit before the cut still counts. A documented exact tie may favor the player.

Pause freezes every clock. Bound route vertices as well as total length; do not simplify a bend through a wall. Shared health and hit grace apply once globally, not once per endpoint.

## Deterministic simulation and route representation

Keep rules independent of render interpolation, animation tweens, audio, particles and wall-clock frame gaps. Choose a fixed simulation step and explicit numeric tolerance; the exact rate is a measured engineering choice, not a guarantee that coarse ticks alone are fair. Store rules RNG separately from decorative randomness.

Represent the outstanding route as an ordered polyline from soul to body:

1. Actual outward travel appends at the body end. Interrupted movement appends only distance really traveled.
2. The soul consumes from its end; RETURN consumes from the body end. Retain partially traversed segments and preserve corners.
3. Clamp previews by dash range, available arc-length capacity, wall collision, representation capacity and predicted genuine reunion.
4. Bound stored vertex count as well as total length. A starting proposal is 64 vertices, unmeasured. Merge only redundant forward-collinear points; never erase a corner through a wall.
5. Trace piecewise motion through corners. A straight old-position-to-new-position sweep is wrong if the route bends within a step.
6. Resolve ordinary last-segment exhaustion at the actual meeting point; prevent negative length or endpoint overshoot.
7. Ribbon self-crossings do not rewire the path. Only actual body–soul contact invokes the deliberate reunion-collapse rule.

### Collision/event ordering

Compute relevant sub-step event times: wall stops, projectile cuts, endpoint hits and body–soul contact. Earlier events affect later ones. An earlier cut prevents a later hit; an earlier soul hit is not erased by a later cut. Do not resolve all attacks before all damage merely because of entity array order.

For exact ties, choose and document one deterministic rule. A player-favoring cut/hit tie is acceptable, but contact ending body protection at a simultaneous environmental hit must also have a stable tested result. No unannounced immunity may leak into return, idle, aim or the soul.

Assert after each step:

- polyline endpoints equal current soul/body positions;
- stored length equals the sum of legal segments within tolerance and does not exceed capacity;
- only actual outward movement appends; follower and RETURN consume their respective ends;
- all retained segments remain traversable;
- reunion clears the route once and enters the correct recovery state;
- shared health and earned arrival effects cannot process twice for the same event.

## Complete encounter traces with human input time

### Trace 1: covered flank versus exposed shortcut

**Setup:** body and soul at (0,0), target at (3,0), a visible environmental beam crosses x=1 near y=0 during seconds 0.8–3.0, and an L-shaped safe corridor goes through (0,2) and (3,2). All upcoming beam timing is shown before the choice. The target prepares an interruptible attack; the beam is environmental and persists independently.

**Conservative route:** aim and dash to (0,2), then (3,2), then the target. With three 0.4-second aim allowances, the illustrative travel/recovery model reaches the target near second 1.97. The soul stays on the safe corridor. After recovery, return along that corridor and meet the soul rather than waiting for it to traverse all seven tiles.

**Shortcut:** a direct dash is much faster but schedules the slow soul through the active beam window. An expert might still make this work with an early safe return and a second attack; that is a legitimate alternate plan, not a design error. Merely killing the attacker does not remove the environmental beam.

**What this tests:** whether the preview makes the slow endpoint's exposure obvious, whether the covered route remains within the tether budget, and whether the shortcut is a conscious risk rather than a surprising death. The precise beam schedule must be validated in the production simulator; it is not supplied as proven level data here.

### Trace 2: chain to interrupt, then vulnerable return

**Setup:** a warden five tiles away announces an exposed-core window from seconds 1.0–1.8. The route is initially safe for the soul. The warden's attack occurs after the opening unless interrupted.

1. Aim for 0.4 seconds; dash three tiles in 0.2 seconds.
2. Recover for 0.15 seconds; aim again for 0.4 seconds.
3. Dash the remaining two tiles in about 0.13 seconds. Arrival is around second 1.28, inside the opening.
4. The soul has advanced only about 1.77 tiles since the first departure. The remaining tether is real exposure, not erased by the kill.
5. Check for already-fired projectiles before returning. Return remains vulnerable.
6. Return when the line is safe and reunite; otherwise use an outward intercept or another safe route.

Even if the player pre-aims while waiting for reunion, the first three-tile trip reunites at about second 1.9; the final two-tile dash then arrives near second 2.03, after the 1.8-second opening. Do not add artificial post-wait aiming time to make this comparison work. Here a chain is justified. Both plans must be tested with slower novice gestures and wider accessibility margins, not only idealized commands.

## Checkpoints: room-entry restart, not exact mid-room resume

The baseline **Continue restarts the current room**. Show this plainly. Preserve previous completed-room progress, loadout choices and settings.

At a safe reunited boundary, persist a versioned room-entry snapshot containing at least rules/content/save versions, run and room IDs, selected template/variant, starter and equipped relic IDs, health/resources at entry, earned charge state, branch history, RNG state, committed draft choices and completed-room reward flags. Use stable IDs.

- Create the checkpoint after committed safe-boundary choices and before the encounter begins.
- In-progress room actions are not silently treated as exact-resume state. Reload recreates the room-entry state consistently.
- Completing a room, granting its reward and advancing the checkpoint is one logical idempotent transaction.
- Repeated load/retry cannot pay completed-room rewards twice or silently reroll an already committed draft.
- Define and display retry behavior for health and consumables. A consistent offline retry advantage is preferable to fragile anti-cheat machinery.
- Keep a previous valid save until the new save has been written and checked. Validate IDs, versions and ranges on load.
- Failed or unavailable browser storage is nonfatal and visibly disclosed. Do not promise permanent, cross-browser or cross-device persistence.
- Restore paused, cancel uncommitted aiming input, and require explicit resume.

Exact mid-room suspend is stretch. It would additionally require the full ordered route and endpoint progress, active movement, enemy/projectile timers and IDs, damage grace, objective state, pending committed command and RNG. Saving only endpoints and drawing a straight line is invalid.

## Mandatory acceptance cases — not yet passed

1. Starting co-located dash departs normally; contact arms only after separation; tiny movements still reunite by route exhaustion.
2. Contact with the moving soul ends the dash at the previewed point, collapses loops once and applies normal recovery.
3. Touching ribbon alone does not reunite. Backward offensive movement spends normal capacity before genuine contact.
4. Short clear contact-dash, long taut RETURN and wall-separated RETURN each retain a useful role.
5. Shared-health attack touches body, soul, both simultaneously and both across adjacent steps without unintended duplicate damage.
6. Dash body protection begins/ends correctly; soul never inherits it; RETURN never attacks, cuts or grants protection.
7. Earlier projectile cut versus earlier soul hit resolves by event time. Test exact ties explicitly.
8. A persistent lane can damage on a later activation; its first hit does not create permanent room immunity.
9. Both endpoints consume a final segment; multiple corners, self-crossings, tiny zigzags and vertex limits preserve legal geometry.
10. A wall truncates preview and travel consistently; no moving door invalidates the committed route.
11. Aiming across changing free capacity refreshes preview; buffered release revalidates rather than silently changing the intended action.
12. Real phones handle tap/drag distinction, cancel, extra pointers, lock/background, orientation interruptions, retry and mute.
13. Source death leaves already-fired projectiles alive. A locked attack never secretly retargets.
14. Full-tether states allow fair anticipation/recovery; ordinary survival does not require compulsory twitch interception.
15. Earned reunion effects fire once per separated-to-reunited transition and consume charge; empty looping cannot farm rewards.
16. Every room-entry/reward/draft save boundary survives reload without duplication, silent reroll or lost completed-room progress.
17. Test the exact exported and uploaded build, not only local development preview.

A failure in input reliability, collision fairness or checkpoint integrity blocks content expansion.


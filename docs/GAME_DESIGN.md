# Game design — OUTRUN YOUR SOUL

> Your body can outrun death. Your soul cannot.

**Project status:** approved design direction; this documentation is not evidence of an implemented or playtested game. Numerical tuning, content layouts, performance and retention remain to be validated.

**Target:** a touch-first portrait HTML5 browser game, with a 720×1280 reference composition adapted responsively to real phones and safe areas. Desktop mouse support is useful, but does not substitute for phone validation. Blender/MCP is an asset-production tool, not a required runtime service.

## Document ownership

- [COMBAT_SPEC.md](COMBAT_SPEC.md) is authoritative for input, movement, collision, reunion and checkpoint behavior.
- [CONTENT.md](CONTENT.md) owns the enemy/relic pool, room-template scope, expedition and depth tests.
- This document owns the fantasy, intended experience and creative quality bar. Art must communicate the rules rather than change them.

## The game, not just the gimmick

A dead courier has stolen their body back from a funeral railway. To escape, cross its living courtyards, defeat the station wardens, and bring the slower soul through the final gate. The world can feel large through looming stations and distant processions without requiring an open world.

This is a room-based action roguelite with route decisions, finite health, sidegrade vows, and relic combinations. It is **not** an endless corridor runner or a passive auto-attacking survival circle.

## The intended game

Build a beautiful, compact action roguelite whose small rule set supports a large decision space. The courier is not simply fast: every route creates a second, slower journey that must remain safe. Speed is both power and commitment.

The core loop is **read → dash → protect or chain → return or catch the soul → reunite → choose a route**. An outward dash can attack and intercept. RETURN is vulnerable retreat, not a panic shield. Genuine physical contact can reunite the two selves early. Exact differences are protected in COMBAT_SPEC.

The fantasy should reach beyond the current room: a funeral railway extends into an immense afterlife; distant gold machinery and processions imply stations beyond the horizon. That sense of scale does not require an open world, long cutscenes or dozens of biomes.

### Three design pillars

1. **Embodied speed.** The fast body and slower soul coexist visibly. If their speeds were equal, the central problem would largely disappear.
2. **Consequential movement.** A good route is not only safe now. It creates an acceptable future for the soul, preserves rescue options and reaches a useful target.
3. **Mastery through different plans.** Short sorties, aggressive chains, interception and careful reunion must each be useful somewhere. No universally optimal dash-return script.

## First 30 seconds

1. **0–3 seconds:** a small ivory figure, a blue soul, and a vermilion ribbon are already in the courtyard. One large directional gesture cue points through a dormant attacker.
2. **3–6 seconds:** drag and release. The body cuts the attacker in a clean burst; the soul visibly travels the same path more slowly. The consequence is readable without text.
3. **6–11 seconds:** a second sentry paints a clear attack line. The ribbon shows where the soul is going. A brief contextual cue introduces return before danger becomes unavoidable.
4. **11–15 seconds:** tap; the body races backward along the ribbon, meets the soul, and their two notes resolve into one chime.
5. **15–22 seconds:** a second short encounter allows a voluntary chain or safe return. No unavoidable tutorial damage.
6. **22–30 seconds:** the gate opens only when both arrive. A view of two next routes establishes a journey rather than an endless score arena.

The first instructional threat can wait for its teaching action. This exception must not conceal unfair normal-room behavior.

## A complete expedition

The jam baseline is a complete beginning, branching middle, final warden and ending. It uses a **pool of six authored ordinary-room templates plus one boss arena**; it does not promise six unique regular combat rooms in every run.

Target roughly 10–15 minutes per expedition, subject to actual play. Do not manufacture duration with waiting, repeated story, long empty travel or a cumbersome loot menu. A compact successful run is better than padded duration.

The exact route graph and content checks are in CONTENT.md. Between encounters, reunited safe stations offer route selection and bounded relic choices. A run can be interrupted through an honest room-entry checkpoint, not a false claim of exact mid-room resume.

### Long-term ambition without artificial grind

Hour one should teach the movement grammar and reveal different ways to finish encounters. Later sessions should let players choose a different starter, draft another pair of relics, take a different branch and solve familiar geometry differently.

A small atlas records discoveries and mastery. Unlocks are lateral options, not compulsory permanent damage increases. Seeds, achievements and daily labels are packaging, not the source of depth. Players returning across days is a goal to measure, not a claim established by a feature count.

## Visual and audio identity

Sunlit cobalt courtyards, ivory masks, vermilion silk, and distant gold funeral machinery. Keep the action bright enough to read; darkness is not a substitute for atmosphere.

The body's snap and the soul's slower procession are the visual identity. Ribbon curves are functional art. A dash pluck followed by a delayed soul chime makes the split audible; reunion resolves the pair. Attack cues need separate clear transients. Respect mute and reduced-motion settings.

No card-dashboard frontend, crowded HUD, fake terminal, or neon generic arena. Health and remaining thread should be legible through a small number of consistent marks.

## Blender-created models and the gameplay plane

Blender/MCP may produce the courier, soul vessel, enemy silhouettes, modular courtyards and distant machinery. The asset pipeline is presentation, not authority over movement.

- Keep the authoritative movement/collision model on a stable two-dimensional gameplay plane, whether the final renderer uses sprites, prerendered models or a fixed 3D presentation.
- A fixed portrait camera must preserve touch prediction, wall silhouettes, attack lines and both endpoints. Do not add camera rotation, jumping or height-dependent combat because models are available.
- Start with one phone-scale composition and a tiny consistent kit. Model a readable body, a visibly different soul, one wall/corner set and one enemy before multiplying assets.
- Keep the ribbon, endpoint preview, hazard warnings and relevant UI as reliable state-bearing overlays. Ornamental geometry must not hide them.
- Share scale, pivots, material palette and lighting direction across the kit. Use simple collision proxies matching the visible traversable boundary.
- Blender source scenes and export settings should be reproducible. Record actual asset provenance, tool use and licenses. Model creation does not imply any third-party character or asset rights.
- The scene should remain beautiful with decorative effects reduced. Loading and phone rendering must be measured on the exported browser build before increasing asset complexity.

These principles do not prescribe unverified Blender MCP commands or an engine-specific export flow; the implementation agent should follow the dedicated art/technical pipeline documentation.

## Baseline and expansion boundary

| Jam baseline | Post-jam or gated stretch |
| --- | --- |
| One polished two-speed movement system and reliable touch controls | Additional movement verbs or new physics |
| Three enemy roles; six ordinary-room templates and a separate boss arena | More enemy roles, regions and bosses |
| Six rule-changing relics; two equipped slots including the starter relic | Nine to twelve relics after interaction coverage |
| Two starting kits reusing the same pool | More lateral starts and challenge families |
| Complete expedition and ending; local atlas/settings/checkpoint | Larger narrative campaign, online features or exact mid-room suspend |
| Fixed readable portrait presentation and coherent sound | Expensive spectacle only after phone/performance gates |

The ambitious vision is a rich journey built from interacting decisions, not an inventory of future promises. If the baseline does not produce different viable routes, improve the rules before expanding content.

## Quality gates

- **Fun:** first touch feels generous; failures are understandable; players voluntarily retry with a changed plan.
- **Visual appeal:** a five-second silent clip and a small-phone still both reveal the two-speed premise. A cover image alone proves nothing.
- **Theme:** speed visibly changes attack, exposure, rescue, progression choices and the climax.
- **Depth:** different builds change target priority, route or reunion timing in the same room. More damage is not enough.
- **Reliability:** the actual exported browser game handles touch interruption, pause, restart and checkpoint recovery.

Stop expanding scope if controls misfire, the soul takes unavoidable damage, every room becomes dash-then-return, or relics never change routes. None of these gates is marked passed by this documentation.


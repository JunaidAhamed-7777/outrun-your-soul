# Release checklist

Status: **not run**. These boxes are acceptance gates for the implementing agent, not claims about an existing game. Official requirements and sources are in [SUBMISSION.md](SUBMISSION.md); the tests below are project-specific QA recommendations.

## A. Lock a candidate

- [ ] Read the current official jam page and resolve material rule changes.
- [ ] Record Git commit, build command, tool versions, artifact name and SHA-256.
- [ ] Record implemented features; remove page claims for unfinished features.
- [ ] Verify the package and project settings against SUBMISSION sections 3–4.
- [ ] Inspect the actual archive contents for secrets, personal data, caches and source-only assets.
- [ ] Finish credits/asset ledger; unresolved rights block release of that asset.

## B. Verify the actual uploaded game

- [ ] Test the itch-hosted release, not only localhost or a preview.
- [ ] Cold-load on Android Chrome and iOS Safari when hardware is available; record exact device/browser and untested platforms honestly.
- [ ] Verify the full start → tutorial → fight → death → retry → completion path.
- [ ] Test portrait at narrow and tall aspect ratios; controls remain reachable above safe areas and browser chrome.
- [ ] Aim, release and RETURN do not cause page scroll, accidental zoom or stuck input.
- [ ] Test pointer cancellation, a second finger, app switch, screen lock and orientation change.
- [ ] Touch coordinates still agree with preview/collision after resizing.
- [ ] Audio begins after deliberate input; mute persists as designed; no doubled music on restart.
- [ ] Detect unsupported graphics/load failures and show a useful message rather than a blank canvas.
- [ ] Profile frame pacing, first load and peak memory on a representative phone. Record measurements, not desktop estimates.

## C. Protect the game’s defining rules

- [ ] Long dashes cannot exceed remaining thread capacity or cut through walls.
- [ ] Soul movement follows the committed spatial route; corners remain navigable.
- [ ] Ribbon is a forecast only, not a hidden damage collider.
- [ ] Actual body–soul contact after separation ends the dash and reunites; crossing ribbon alone does not.
- [ ] RETURN retraces the path, remains vulnerable and does not attack during travel.
- [ ] Shared health, per-attack hit deduplication and damage grace behave consistently.
- [ ] Already-fired projectiles survive the shooter's death as specified.
- [ ] Preview, enemy target locks, hit effects and actual outcomes agree.
- [ ] Relic incompatibility, two-slot limit, replacement and charge rules are enforced.
- [ ] At least two build configurations demonstrably change a player's safe route/order in the same encounter; otherwise reduce depth claims and improve the encounter.

## D. Check reliability and replay

- [ ] Repeated death/restart does not leak entities, sounds, timers or event listeners.
- [ ] Continue restores the documented room-entry state with the correct seed, draft and reward state.
- [ ] Reloading cannot duplicate a committed reward.
- [ ] Missing/corrupt/blocked storage fails safely; the game remains playable.
- [ ] No network service, login or secret key is required to complete a run.
- [ ] A first-time player can explain body/soul risk after the opening encounter without reading repository docs.
- [ ] A fresh run remains worthwhile after a win; record actual playtest observations separately from hopes.

## E. Final page and submission

- [ ] Screenshot and control instructions match the candidate build.
- [ ] Complete truthful AI disclosure and tool/asset credits.
- [ ] Owner review completed for public page, entry answers and any new acceptance step.
- [ ] Public project is accessible outside the owner session.
- [ ] Complete the jam-entry step; do not confuse a saved project with an entered game.
- [ ] Verify both project URL and jam entry URL, then perform one final phone launch.
- [ ] Record the submission timestamp and archive the exact candidate.
- [ ] Apply the deadline freeze described in SUBMISSION; do not “hotfix” the judged build afterward.

## Release record template

| Field | Value |
|---|---|
| Candidate commit | Pending |
| Build command and tool versions | Pending |
| ZIP filename / SHA-256 | Pending |
| Project URL | Not published |
| Jam entry URL | Not submitted |
| Submission timestamp (UTC and IST) | Pending |
| Devices / browsers actually tested | None recorded |
| First-load / frame-time measurements | Not measured |
| Known remaining defects | Not assessed |
| Owner review | Pending |

Never commit contact-email answers, authentication cookies, tokens or private dashboard links in this record.

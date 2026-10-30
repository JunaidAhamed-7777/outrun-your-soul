# Publishing and submitting OUTRUN YOUR SOUL

Verified against official sources on **2026-10-30**. The platform is **itch.io**. This guide documents the process; it is not evidence that an account is registered, a game exists, or an entry has been submitted.

## 1. Slapjam #2 compliance gate

The official jam requires a game made during **October 29, 15:00 UTC to October 31, 15:00 UTC, 2026**. The closing time is **October 31, 20:30 Asia/Kolkata (IST)**. Use AI in development. The theme is **Speed**. Deliver mobile-portrait touch gameplay, with 720×1280 the suggested target, playable within itch.io. A downloadable archive alone or an externally hosted game does not qualify. Judges weight Fun, Visual Appeal and Theme Following equally.

Submit a valid email in the **private prize-contact field**; do not commit it or put it in public page text. The public tool checklist is optional: report only tools actually used. **No build updates after the deadline, including game-breaking fixes.** Judging ends November 7 at 15:00 UTC. [Official jam rules](https://itch.io/jam/slapjam-ai-2).

Entry is free and open internationally. Asset packs are permitted when the creator has the necessary rights. The organizer asks entrants to describe their AI tools. A separate optional Rosebud award does not replace the itch.io entry. This roadmap does not depend on that award or require a second hosting platform. [Organizer website](https://slapjam.ai/).

## 2. Understand the three different states

1. **Joined:** participation/account state, not a delivered game.
2. **Published:** an itch.io project page exists and its game is playable.
3. **Submitted:** that project has been entered into this particular jam.

During the submission window, use the jam's submission button and select the project. itch.io creates a separate jam entry page, distinct from the normal game page. Keep both URLs. An uploaded project is not automatically entered. The platform can support late entries at a host's discretion; that is **not permission to miss Slapjam's deadline**. [itch.io jam process](https://itch.io/docs/creators/game-jams#the-submission-process).

## 3. Package the production build

Upload a ZIP containing the playable web export and its dependencies, with `index.html` at the archive root. Keep references relative and filename case exact. Do not upload the source checkout or individual dependency files as separate game uploads. itch.io's documented limits are **1,000 extracted files, 240-character paths, 500 MB total extracted, and 200 MB per extracted file**; filenames use UTF-8. External requests require HTTPS.

Select the HTML game type. The HTML5 game runs in an iframe. Desktop can use an embedded viewport or click-to-launch fullscreen; mobile uses the fullscreen launch flow. Enable **Mobile Friendly** only after testing it. Make the canvas resize correctly. Click-to-play supports intentional audio startup; autoplay may be muted. [itch.io HTML5 documentation](https://itch.io/docs/creators/html5).

Project packaging policy: include only runtime files. Exclude `.blend` sources, source maps containing unwanted source, temporary renders, secrets, `.env`, developer caches and dependency folders. Keep models, textures, sounds and fonts local to the export wherever feasible. Pin the release to a Git commit and archive SHA-256. A correct build must work without a development server or an API key.

## 4. Configure the project page

Use a draft while preparing the page. Draft and restricted modes limit access; for release choose **Public**, without a password, future release-date gate or disabled access. Verify it outside the owner's signed-in session. [itch.io access controls](https://itch.io/docs/creators/access-control).

The organizer's walkthrough specifies: upload the ZIP, select **This file will be played in the browser**, configure the portrait viewport/fullscreen launch, enable **Mobile friendly**, select portrait orientation where offered, save, and publish. Then use **Submit your project** on the jam page. Labels may vary; inspect the actual current interface rather than blindly replaying clicks. [Organizer upload walkthrough](https://slapjam.ai/docs/export-godot-itch/).

For a Godot implementation only: the same walkthrough advises a Web export named `index.html`, with thread support off unless deliberately configured and tested. Do not copy Godot-specific settings into another engine. It recommends a build well under 50 MB; this is guidance, not the platform's hard limit. Blender is an asset-authoring tool, not the game's browser export target.

### Page content to prepare

These are project recommendations, not extra jam rules:

- **Title:** OUTRUN YOUR SOUL.
- **Short hook:** Your body can outrun death. Your soul cannot.
- **Opening description:** one sentence describing the fast body, slower soul and risky route between them. Only describe mechanics implemented in the release.
- **Controls:** actual drag/release dash and RETURN behavior; pause, mute and restart; any tested desktop alternative.
- **What to expect:** real run structure, save behavior and current content. Do not promise hours of content before testing.
- **Images:** one readable cover and actual gameplay screenshots. Clearly label any concept illustration; never substitute it for gameplay evidence.
- **Theme:** explain how unequal speeds change route, attack and reunion decisions. Avoid an essay before the Play button.
- **Known limitations:** device/browser issues still present, accurately scoped.
- **Credits:** contributors, asset authors, tools, relevant licenses and source URLs.

Metadata should accurately describe the release. itch.io provides an **AI Disclosure** section: disclose generated material honestly there and in the description. Ordinary pathfinding/procedural game logic is not by itself generative AI. Use relevant tags and real screenshots; avoid misleading content or spam pages. The optional Slapjam checklist does not replace platform disclosure. [itch.io quality guidelines](https://itch.io/docs/creators/quality-guidelines#accurately-tag-your-use-of-generative-ai).

Project rights policy: maintain an asset ledger with file, creator/source, license, attribution and transformation. Blender MCP does not grant rights to downloaded models or textures. Verify each asset's actual terms. A public repository is not automatically an open-source license; do not add a blanket license covering third-party assets or choose the owner's license without a decision.

## 5. Submit and verify, not just upload

The owner handles account registration. Before any agent submits, the owner must review the actual game page, entry answers and any event-specific acceptance presented. Keep the contact field private. This document does not authorize accepting new terms or transmitting credentials.

Run [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). After an authorized submission:

1. Open the returned jam entry URL and verify the correct title and project link.
2. Open that project's Play action in a clean session on a real phone.
3. Confirm the build/version is the tested release, not a stale upload.
4. Save the two URLs, submission timestamp, Git SHA and ZIP hash in the release record. Do not store private form answers or session URLs.
5. Keep the submitted build unchanged after cutoff. Preserve the exact jam archive even if post-jam development later resumes.

## 6. Timing and unknowns

Recommended internal target: a working, tested submission by **October 31, 17:30 IST (12:00 UTC)**, leaving three hours for upload or platform failures. This is an engineering buffer, not a changed official deadline. Stop expanding scope when release gates are at risk.

Not yet verified by this documentation: the owner's joined status, authenticated submission form's complete current fields, a live project URL, browser compatibility, rights to future assets, or successful submission. Recheck the official jam page before release for material rule changes. Do not infer compliance from other entries or assume a host will grant an exception.

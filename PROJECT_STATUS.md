# DayTrace status — 2026-10-21

Version: 0.2.0 (concurrent activities; initial physical iPhone workflow accepted on 0.1, extended QA remains).

## 0.2 concurrent activities — 2026-10-21
- Owner selected primary activity plus an optional concurrent activity, with concurrent totals shown separately. Primary time partitions the day exactly once; secondary totals use the same clipped interval duration, including midnight and DST boundaries.
- Editor, gap fill, split/merge, boundary edits, undo/trash, recent list, timeline labels and daily/weekly/monthly reports support both roles. A secondary needs a primary, must differ from it, and must reference a category belonging to the same owner.
- JSON exports use schema 2 and imports accept schemas 1/2; legacy records normalize to no secondary. CSV appends a secondary-category column and retains one row per interval.
- IndexedDB upgrades additively to version 2 in the same database namespace. Old outbox payloads and operation IDs are retained unchanged and sent through legacy RPC for lost-ack receipt compatibility; new commands use v2 RPC. Once concurrent data exists, legacy new writes stop rather than discard it; upgraded clients can review/reconcile that queue as a conflict.
- Additive migration `20261021013145_secondary_activities.sql` applied to real Supabase. Locked before/after fingerprints verified existing activities and cursor/revisions were unchanged; the new field is null on all pre-existing records. Legacy snapshot shape remains stable. RLS remains enabled, both snapshots deny anonymous HTTP calls with 401, and advisor findings are documented in docs/SECURITY.md.
- Verified locally: TypeScript/build, 29 unit/storage/transport tests (including real v1 IndexedDB upgrade and unchanged payloads), legacy plus v2 PGlite SQL suites, 6 Chromium/mobile-WebKit UI tests including backup/restore, and production Chromium PWA offline/reopen with both activities. Initial test harness timing/output-directory collisions were corrected; these are passing final runs.
- Frontend publication completed: deployment run `39528936074` and full CI run `39528934702` passed for commit `e82ceea`. In the existing owner browser, the prompted 0.1→0.2 update reopened the old records with synced status and zero queued operations. The live editor displayed the optional secondary-activity selector; it was closed without saving. No live owner activity was assigned a secondary or otherwise modified for testing. Physical iPhone acceptance of 0.2 remains to be confirmed by the owner after updating.

## Architecture and environment
- Workspace was empty; no existing Git repository, source, or applicable AGENTS.md found.
- React + TypeScript + Vite, Dexie / IndexedDB, Supabase Auth / PostgreSQL.
- GitHub Pages base comes from VITE_BASE_PATH; repository `Wittaya-Tasu/DayTrace`, deployed at `https://wittaya-tasu.github.io/DayTrace/`.
- Local development namespace is isolated from every cloud user / environment.
- Reference JPEG was not supplied; use the handoff's written green / Thai visual specification.

## Implemented
- Owner-requested category revision: 12 defaults in the supplied order; rename self-care to personal errands, learning to learning/development, housework/errands to housework, and normalize family/social spacing; insert entertainment after rest. Existing category IDs, activity rows and open cursor preserved. Applied to the owner's cloud data through one normal category-update RPC with revision/receipt/audit handling and locked before/after activity checks; source seed IDs are now explicit and independent of display order. TypeScript and all 20 unit/storage tests passed after the source change.
- Thai responsive capture UI; fixed tap end; pending assignment persists across reload.
- Atomic IndexedDB view/cursor/outbox; split, merge, boundary preview, fill gaps, cursor correction, undo and trash.
- Category management (name/color/icon/order/pin/archive); real daily/weekly/monthly timeline and summary with UTC / IANA / DST handling.
- Supabase Free DayTrace project created in Wittaya-Tasu's Org, Singapore; reference `bewdhwsfplacrblpxgan`.
- Initial SQL migration applied to real project: owner allowlist, RLS, composite ownership FK, locked atomic RPC, idempotency receipts, revision checks and bounded audit.
- Client Google PKCE integration, account/environment isolation, sequential outbox, retries, conflict export/reconciliation UI. Real Google owner login, authenticated initialization, online user activity delivery and iPhone offline activity delivery are verified.
- JSON consistent export / validation / import preview / merge or replace; Thai CSV; weekly export reminder.
- PWA manifest, original PNG icons, self-hosted Sarabun+license, offline shell/fonts, prompted update and safe-area styles.
- Setup / architecture / security / operations / iPhone QA docs, manual Pages deployment workflow and separate CI checks.
- Dependencies pinned, lockfile present. Public repository `https://github.com/Wittaya-Tasu/DayTrace` created and source pushed after explicit user approval. GitHub CLI authorization completed; its credential is in the OS keyring, not source. Deployment workflow remains manual. Only Supabase URL and publishable frontend key are repository variables.

## Pending external setup
- Google Cloud project DayTrace (`daytrace-512002`): OAuth branding and `DayTrace Web` OAuth Client created by user. User transferred credentials directly to Supabase; Google provider enabled and verified through public Auth settings API. No secret values read or saved in source/chat. Initial local Site URL was replaced by the production HTTPS URL below; exact local redirects remain. User added their chosen Google account as a test user and successfully signed in.
- Sole owner allowlist entry added after explicit user approval. Guarded transaction verified the supplied current account has a Google identity and refused to proceed if another owner existed. App permission refresh opened the cloud capture screen showing “ซิงก์แล้ว”, zero activities and no initialized cursor. Existing development records remain isolated and were not changed or imported.
- HTTPS publication completed at `https://wittaya-tasu.github.io/DayTrace/`. Supabase Site URL and exact production redirect were saved and confirmed; both local redirects retained. Google OAuth client now includes `https://wittaya-tasu.github.io` as an authorized origin, verified by reopening its saved form. Supabase callback remains unchanged. Portable official GitHub CLI is in ignored `.tools/`.
- Extended QA: real second-account denial / expired session / two-device concurrent edits and conflicts. Normal authenticated online delivery and iPhone offline delivery are already verified.
- Extended physical iPhone QA: keyboard, storage limits, text zoom, safe areas and upgrade behavior. Safari login, Home Screen opening, offline reopening/capture/persistence and resynchronization have passed the owner-guided checks below.

## Tests actually run
- TypeScript typecheck: passed.
- Vitest: 20 tests passed (time model / split / merge / boundary rollback / midnight / DST / CSV / backup / IndexedDB durability / quota failure / undo / account isolation / mocked transport lost ack / conflicts / expired auth).
- PGlite SQL suite: passed against initial migration.
- Exact SQL suite also passed against real Supabase in a rolled-back transaction with simulated auth users / role claims. No fixtures retained. This is SQL-role integration, not real Google OAuth sessions.
- HTTP Supabase API: anonymous owner/snapshot RPC requests denied with 401; Google provider initially disabled, then verified enabled after the user saved credentials.
- Typecheck passed after adding the signed-in user's own UUID to the pending-owner screen. A broad auth-user listing was rejected by approval review; no account list was obtained. Owner setup used the current signed-in user's visible UUID instead.
- Real Google OAuth first login, own-account owner authorization and initial authenticated app initialization verified in the user's current browser. Screenshot saved outside source. No activity was created, edited or deleted for this verification.
- User created the first cloud activity. Its category, note and exact start/end were confirmed against the current browser and a narrowly scoped read of that owner's latest non-deleted server record. Actual authenticated activity delivery is verified; no test activity was inserted.
- Pre-publication checks passed again: 20 unit/storage tests, PGlite SQL suite, TypeScript, `/DayTrace/` production build and manifest/asset base assertions. Candidate source audit found no owner UUID, OAuth secret, private key or `.env.local` in the upload set.
- GitHub Actions initial source check succeeded: run `39094525067`; production build/deploy succeeded: run `39094530508`, source commit `2bb3ab6`.
- Live HTTPS URL returned 200. Production Google PKCE login returned to the exact `/DayTrace/` base; the signed-in app displayed “ซิงก์แล้ว” and the same user-created activity and open cursor as local. No activity mutation was made for verification. Screenshot retained outside source.
- Live manifest scope/start URL `/DayTrace/`, standalone display, all manifest icons, Apple touch icon and service worker returned valid responses.
- Physical iPhone owner-guided acceptance on 2026-10-18: owner confirmed Safari Google login shows the original activity and synced status, opening from the Home Screen icon, and the instructed airplane-mode/Wi-Fi-off capture, close/reopen persistence and return-online sync sequence. Model/iOS version were not supplied; these are owner-reported device results, not remotely observed automation.
- Narrowly scoped server verification of the owner's latest activity confirmed the offline test record exists, is assigned, has version 2, and has exactly one non-deleted record with its start/end pair. No activity was inserted, edited or deleted by the agent for this verification. Private note, account UUID and activity timestamps are not recorded in public source.
- Playwright dev UI: 4 tests passed across Chromium and mobile WebKit (capture / reload pending / assign / reports / JSON download and fresh-profile restore / repeat import conflict / 375px layout / category creation).
- Production PWA Chromium: 1 test passed (initial SW control, offline reload, pending assignment offline, persisted records, cached fonts, no Supabase/auth responses cached).
- Production build passed; generated manifest, SW, fonts and icons. Bundle currently ~873 kB JS / ~251 kB gzip, with a Vite size advisory; shell precache ~995 kB.
- Separate `/DayTrace/` production build passed; assertions verified manifest start_url/scope, JS assets and apple-touch-icon under the repository base.
- Browser visual inspection performed; mobile WebKit screenshot in docs/screenshots contains QA records, not owner production data.

## Known limitations / release gates
- The three requested rollout steps are complete: cloud record verification, HTTPS publication, and basic physical iPhone Home Screen/offline/resync acceptance. This establishes readiness for initial personal use; it does not establish every advanced editing, multi-device stress, storage-pressure or upgrade scenario.
- Local schema is v2. V1→v2 store/queue migration passed automated tests and the existing owner desktop-browser update; physical iPhone upgrade is still awaiting owner confirmation. No destructive reset / purge is implemented.
- Undo conservatively supports the latest safe operation; local history is capped at 50 snapshots / 90 days. Dataset cap: 500 categories, 50,000 intervals including tombstones, JSON 20 MB.
- Expired trash remains a tombstone; receipts are retained. Future archival requires a safe versioned migration.
- Security advisor reports intentional no-policy allowlist and guarded authenticated SECURITY DEFINER RPC exposure; rationale and remediation links are in docs/SECURITY.md.
- Public HTTPS deployment is live. No paid plan, custom domain, AI API or automatic Drive backup.

## Release gate
Initial personal use is accepted for the verified core workflow. Keep the remaining unchecked items in docs/IPHONE_QA.md and extended auth/concurrency scenarios open; do not describe untested behavior as verified or label this a fully qualified 1.0 release.

# DayTrace status — 2026-10-18

Version: 0.1.0 (development; not a production release).

## Architecture and environment
- Workspace was empty; no existing Git repository, source, or applicable AGENTS.md found.
- React + TypeScript + Vite, Dexie / IndexedDB, Supabase Auth / PostgreSQL.
- GitHub Pages base comes from VITE_BASE_PATH; actual GitHub repository is not yet selected.
- Local development namespace is isolated from every cloud user / environment.
- Reference JPEG was not supplied; use the handoff's written green / Thai visual specification.

## Implemented
- Thai responsive capture UI; fixed tap end; pending assignment persists across reload.
- Atomic IndexedDB view/cursor/outbox; split, merge, boundary preview, fill gaps, cursor correction, undo and trash.
- Category management (name/color/icon/order/pin/archive); real daily/weekly/monthly timeline and summary with UTC / IANA / DST handling.
- Supabase Free DayTrace project created in Wittaya-Tasu's Org, Singapore; reference `bewdhwsfplacrblpxgan`.
- Initial SQL migration applied to real project: owner allowlist, RLS, composite ownership FK, locked atomic RPC, idempotency receipts, revision checks and bounded audit.
- Client Google PKCE integration, account/environment isolation, sequential outbox, retries, conflict export/reconciliation UI. Real Google owner login and initial authenticated cloud initialization verified; activity delivery still awaits a real user record.
- JSON consistent export / validation / import preview / merge or replace; Thai CSV; weekly export reminder.
- PWA manifest, original PNG icons, self-hosted Sarabun+license, offline shell/fonts, prompted update and safe-area styles.
- Setup / architecture / security / operations / iPhone QA docs, manual Pages deployment workflow and separate CI checks.
- Dependencies pinned, lockfile present. Local Git initialized with commit `636769d`; remote `https://github.com/Wittaya-Tasu/DayTrace.git` added. Public repository created after explicit user approval. Source push is pending GitHub CLI device authorization; connector write returned 403 and Git had no cached login. No source was uploaded by those failed attempts.

## Pending external setup
- Google Cloud project DayTrace (`daytrace-512002`): OAuth branding and `DayTrace Web` OAuth Client created by user. User transferred credentials directly to Supabase; Google provider enabled and verified through public Auth settings API. No secret values read or saved in source/chat. Site URL `http://127.0.0.1:5173/` and exact redirects for localhost / 127.0.0.1 port 5173 saved by user and confirmed in dashboard. User added their chosen Google account as a test user and successfully signed in.
- Sole owner allowlist entry added after explicit user approval. Guarded transaction verified the supplied current account has a Google identity and refused to proceed if another owner existed. App permission refresh opened the cloud capture screen showing “ซิงก์แล้ว”, zero activities and no initialized cursor. Existing development records remain isolated and were not changed or imported.
- Public repository `Wittaya-Tasu/DayTrace` and publication explicitly authorized by user; repository exists. Intended Pages URL is `https://wittaya-tasu.github.io/DayTrace/`, not live or verified yet. Supabase Site URL and an exact HTTPS redirect were saved and confirmed in dashboard; both local redirects retained. GitHub CLI authorization page is open for the user to review broader standard CLI permissions and approve themselves. Portable official CLI is in ignored `.tools/`; no credentials are in source.
- Real two-account Google login / expired session / online outbox delivery / two-device concurrency and conflict tests.
- Physical iPhone Home Screen, keyboard, storage limits, text zoom and upgrade QA.

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
- Playwright dev UI: 4 tests passed across Chromium and mobile WebKit (capture / reload pending / assign / reports / JSON download and fresh-profile restore / repeat import conflict / 375px layout / category creation).
- Production PWA Chromium: 1 test passed (initial SW control, offline reload, pending assignment offline, persisted records, cached fonts, no Supabase/auth responses cached).
- Production build passed; generated manifest, SW, fonts and icons. Bundle currently ~873 kB JS / ~251 kB gzip, with a Vite size advisory; shell precache ~995 kB.
- Separate `/DayTrace/` production build passed; assertions verified manifest start_url/scope, JS assets and apple-touch-icon under the repository base.
- Browser visual inspection performed; mobile WebKit screenshot in docs/screenshots contains QA records, not owner production data.

## Known limitations / release gates
- Whole-system completion is not claimed. Real OAuth login, authenticated initialization and user activity delivery are verified; transport concurrency stress and physical iPhone results are still pending.
- First local schema is v1; real upgrade from an older deployed schema has not been tested. No destructive reset / purge is implemented.
- Undo conservatively supports the latest safe operation; local history is capped at 50 snapshots / 90 days. Dataset cap: 500 categories, 50,000 intervals including tombstones, JSON 20 MB.
- Expired trash remains a tombstone; receipts are retained. Future archival requires a safe versioned migration.
- Security advisor reports intentional no-policy allowlist and guarded authenticated SECURITY DEFINER RPC exposure; rationale and remediation links are in docs/SECURITY.md.
- No public deployment, paid plan, custom domain, AI API or automatic Drive backup.

## Release gate
Do not describe the whole application or iPhone support as complete until the remaining production and device checks pass. Publication is now requested and authorized; it has not yet completed.

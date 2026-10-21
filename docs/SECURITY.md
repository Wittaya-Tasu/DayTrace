# Security verification

## Controls

- Supabase Google PKCE via the supported browser SDK; session refresh remains SDK managed.
- Admin-managed owner allowlist, server `auth.uid()`, RLS on all exposed tables.
- Composite foreign keys for both primary and secondary categories reject cross-owner references; a secondary requires a distinct primary.
- No authenticated / anonymous direct write grants; atomic RPC only.
- `SECURITY DEFINER` functions use an empty search_path, schema-qualified objects, explicit owner validation and revoked PUBLIC / anon EXECUTE.
- No service_role / DB password / Google secret in frontend, source, IndexedDB exports, or logs.
- Notes render as React text; browser CSP limits scripts/assets to this app and network to this app / Supabase. Google OAuth is a top-level redirect, not an embedded script.
- Local namespaces include both environment and owner UUID. Logout retains pending data in its original namespace.
- CSV neutralizes formula prefixes and quotes all cells. JSON is runtime validated, capped, previewed and rebound to the current account.

## Checks actually run (18 Oct 2026)

The exact transaction in `tests/database.sql` passed both PGlite and the real Supabase project. It creates three disposable auth identities in a transaction, switches actual database roles and claim settings, checks permission behavior and rolls back all fixtures. It verifies anonymous / denied account / cross-owner SELECT, direct-write rejection, self-allowlist rejection, duration milliseconds, duplicate receipt, ID reuse, stale revision, overlap rollback, open range, composite FK and a consistent snapshot.

Real HTTP API checks also confirmed that unauthenticated requests to owner check / snapshot RPC are denied (401). This is not a completed Google two-account end-to-end test. Google provider was disabled at this check; actual OAuth sessions, token refresh and cross-device concurrency are pending.

## Supabase advisor findings

The real security advisor on 21 Oct 2026 reports the following findings, not an empty report:

1. **RLS enabled, no policy** on `owner_allowlist`. Intentional: clients cannot read or mutate this table; only the guarded server function reads it. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
2. **Authenticated SECURITY DEFINER function executable** on five app RPCs, including the v2 snapshot/write pair. Intentional API entrypoints; each validates the actual auth UID / allowlist, uses fixed search_path and exposes no client direct DML. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
3. **Leaked password protection disabled** in Auth. The app's login UI uses Google; email provider remains enabled at the platform level. No password-policy or paid-plan change was made as part of concurrent activity support. Owner allowlist checks still apply to every RPC. [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

The v2 SQL suite passed in PGlite: anonymous denial, primary/secondary constraints, cross-owner references, replay/ID reuse, legacy snapshot shape, legacy-write guard, explicit removal and legacy lost-ack replay after concurrent data exists. Anonymous v2 snapshot requests to the real project returned 401; migration fingerprints verified existing activity and timeline rows were unchanged. No new production test activity was written.

Re-review these after any change. Do not disable RLS or grant table writes just to remove advisor messages.

## Scope and remaining gates

Browser storage is not encrypted at rest by this app and not an end-to-end vault. A person with access to the unlocked browser profile can access its local data/session. No claim of an independent security audit or zero vulnerabilities is made. Test real Google accounts, actual concurrent sessions and the physical iPhone before release.

# Operations, updates and recovery

## Database migration

Initial migration is additive on an empty dedicated project. Apply tracked files through Supabase migration tools / CLI, never ad hoc replacement tables. Schema and policy definitions are versioned. The SQL source contains BEGIN/COMMIT and must complete atomically.

Before later migrations: export JSON on each device with pending data, test migration against disposable data, and verify receipts + outbox reconciliation. Use a forward corrective migration to roll back behavior. Do not DROP application tables as a rollback; dropping data or receipts breaks recovery / idempotency. Failed initial DDL rolls back as a transaction.

## Cloud inaccessible

Keep capturing locally. Check the dashboard and actual error (provider outage, session, network, paused project). Do not repeatedly log out / clear storage to fix sync. If the Free project is confirmed paused, restore it in the dashboard and sync again. Do not create fake keep-alive traffic or upgrade without an explicit user decision.

## Conflict

Settings shows local/server interval counts, cursor and revisions; export both datasets and inspect the full JSON. Choosing merge rejects conflicting IDs or overlaps. Choosing a primary dataset replaces through a new atomic import at the reviewed server revision. Original local operations are retained in the exported JSON; they are never automatically replayed. A new server edit can trigger another conflict.

## Import / replace

Validate file ≤20 MB, schema v1, timestamps, IDs, categories, overlap, cursor and current account. Preview before committing. Default merge is conservative; same ID with changed content requires choosing incoming or replacing. For these choices, save the current JSON first and verify the file has been kept. Dataset changes occur as one IndexedDB transaction and one server operation.

If restoring from local development to the real account, login to the allowed owner and import the JSON there. Dev and cloud DBs are intentionally separate.

## Retention

Trash restoration: 30 days. Server audit: 90 days. Local undo: latest safe operation, capped at 50 entries / 90 days. Mutation receipts do not expire with trash. Expired tombstones currently remain stored; there is no destructive automatic purge. The initial implementation caps datasets at 50,000 intervals / 500 categories and validates limits before import. A future archive migration must retain receipts and preserve reconciliation.

## Frontend rollback

Keep the last known good deployment artifact / commit and JSON exports. Redeploy that source via Pages; retain compatible IndexedDB schemas. Never fix a service worker cache problem by instructing the user to erase browser data without a verified export. Current v0.1.0 supports prompted SW updates; real upgrade + DB migration remains on the iPhone acceptance list.

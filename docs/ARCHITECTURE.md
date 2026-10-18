# Architecture and protocol

## Time model

`activity_intervals` + `timeline_state.cursor_at` are authoritative. Intervals are half-open `[start,end)` with actual UTC timestamps at millisecond precision. Pending is derived from null category; duration is derived, never separately editable. Timer ticks refresh the screen only. Foreground recomputes from `Date.now() - cursor`.

Temporal handles IANA day boundaries, DST, Monday weeks and calendar months. Reports clip intervals to each real day. Assigned / pending / gap / open / future partition the entire day. Percent denominator is the real day, including the remainder of today; period averages exclude future dates.

## Local transaction

Dexie DB name: `daytrace:v1:<environment hostname>:<auth user UUID>`; local development uses `daytrace:v1:development`. No automatic adoption of development data into an authenticated account.

The `states` record contains a canonical snapshot, optimistic view, server revision, ordered outbox, undo history, conflict snapshot and device/export metadata. A readwrite transaction computes a domain operation and commits view + cursor + outbox together. UI reports success only after transaction completion. Dexie liveQuery subscribes read-only after initialization.

Undo is revision guarded, produces a new mutation, and retains tombstones for introduced entities. It is conservatively limited to the latest operation from this device. No rewind over remote revisions. History is capped at 50 entries / 90 days.

## Shared mutation transport

Every command has a client reducer and produces an upsert patch:

```text
apply_timeline_operation(
  p_operation_id: UUID,
  p_expected_revision: bigint,
  p_type: command label,
  p_payload: {categories: Category[], intervals: Interval[], cursor_at, timezone},
  p_device_id: UUID
)
```

The database deliberately accepts validated record patches instead of duplicating each UI reducer in PL/pgSQL. The type labels are allowlisted and audited. It checks identity, owner allowlist, payload fields and size, constraints, monotonically increasing record versions, composite category ownership, positive durations, no overlap and no interval after cursor. Thus an owner may legitimately edit their own timeline; the server does not rely on a client-provided owner ID or duration.

All client DML privileges are revoked. Each RPC holds the same owner's `timeline_state FOR UPDATE` lock until transaction commit. Overlap is checked after all affected rows are upserted, allowing shared edges to move atomically. This is the transaction-based alternative to an exclusion constraint. The SQL tests verify rollback; true concurrent transport stress with multiple sessions remains a release gate.

Idempotency receipts bind operation ID to a canonical JSONB digest including payload, type, revision and device. Retry after commit returns the same revision, even if newer revisions exist. Reusing an ID with different input fails. Receipts store only a small result, never another full history snapshot; they are not deleted with trash.

## Sync

The queue uses sequential expected revisions and stable operation IDs. Web Locks elect one sender per namespace across tabs. After ack, canonical + revision + queue deletion update in one local transaction, then replay pending optimistic patches. New mutations can be enqueued during network awaits. Pull only replaces a queue-free view.

Sync runs on startup, foreground, online and after mutation (debounced). Network / 5xx retries back off with jitter up to roughly 60 seconds; authentication and validation errors stop automatic retry. Revision conflict preserves the entire queue and optimistic view, fetches server state and stops dependent mutations. Export both sides before explicitly merging or choosing a primary dataset. Conflict resolution creates a fresh import operation at the reviewed server revision; if server changes again it conflicts again.

No iOS Background Sync dependency. No realtime or second-by-second polling. Remote account verification precedes first bootstrap; a previously verified owner may access cached local records during a network outage, while database RLS always enforces actual server permission.

## Backup

Consistent IndexedDB snapshot; explicit field allowlist excludes auth tokens. JSON contains actual records, cursor, timezone, sync label and pending operations for inspection/recovery. Import validates and rebuilds canonical records with a fresh operation; never replays exported operations. Existing IDs require explicit conflict resolution. Replace mode tombstones removed intervals and archives omitted categories in one transaction.

## PWA

App shell, fonts and icons are precached in the configured Pages scope. Supabase API/auth responses have no runtime cache rule. OAuth query callbacks bypass navigation fallback. Prompted updates wait until capture/edit dialogs are closed. IndexedDB upgrades must be additive and preserve every queued operation byte-for-byte, especially operation IDs and payloads that may already have committed remotely.

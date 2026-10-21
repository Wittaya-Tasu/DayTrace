# Changelog

## 0.2.0 — 2026-10-21

- Add one optional concurrent activity per interval. Primary totals count elapsed time once; concurrent totals appear separately for day/week/month.
- Preserve both roles through offline capture, edits, split/merge, undo/trash, JSON v2 backup/restore and CSV export; accept v1 backups.
- Additive IndexedDB v2 upgrade preserves legacy outbox payloads and IDs; versioned server RPCs retain legacy snapshot/receipt compatibility and reject legacy writes that could lose concurrent activity data.
- Additive PostgreSQL migration verifies existing activity/cursor data is unchanged and retains owner RLS/permissions. No existing owner activity is automatically relabeled with a secondary.

## 0.1.0 — category update (2026-10-18)

- Defaults now contain 12 activities in the owner's requested order, adding บันเทิง after พักผ่อน.
- Rename ดูแลตัวเอง → ธุระส่วนตัว, เรียนรู้ → เรียนรู้/พัฒนา, งานบ้าน / ธุระ → งานบ้าน, ครอบครัว / สังคม → ครอบครัว/สังคม.
- Existing category identities and recorded activity data remain intact; seed identities are independent of display order.
- Current release is published on HTTPS; owner accepted Google login and basic physical iPhone Home Screen/offline/resync use. See PROJECT_STATUS.md for evidence and remaining extended QA.

## 0.1.0 — 2026-10-18 (development)

- Thai capture UI with retrospective assignment, pending queue, timeline and day/week/month reports.
- Transactional IndexedDB, real edit/split/merge/shared-boundary preview, undo, trash and category management.
- Supabase owner access schema / RLS / atomic patch RPC / receipts / optimistic revision queue.
- Google PKCE integration prepared; real Google provider and owner login still pending setup.
- JSON preview/restore, Thai CSV, export reminder, PWA assets/offline shell/update prompt.
- Automated domain/storage/transport/browser/SQL tests and deployment/setup/iPhone QA documentation.
- No public deployment or paid services activated.

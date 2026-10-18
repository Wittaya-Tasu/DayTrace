# Physical iPhone acceptance checklist

**Core workflow accepted by the owner on a physical iPhone on 2026-10-18.** Results below distinguish owner-reported checks from server verification. Extended device checks remain open; WebKit automation does not establish untested iOS behavior.

Device target: iPhone 16 Plus; also iPhone 16, iPad and desktop.

Actual acceptance device: owner's iPhone; exact model and iOS version not supplied. The target list above is not a claim that those models were tested.

Live URL: **https://wittaya-tasu.github.io/DayTrace/**. Desktop production login and retrieval of the owner's existing activity passed on 2026-10-18. Owner then confirmed the Safari login, Home Screen launch and offline/resync sequence on their iPhone. The server contained one copy of the latest offline test interval after sync; no activity was changed by the agent.

Initial owner-guided acceptance:
1. Open the live URL in Safari, sign in with the same Google account, and confirm the existing activity and synced status.
2. In Safari, use Share (possibly inside the Page Menu), then Add to Home Screen. Enable Open as Web App if offered, and tap Add. Open the new DayTrace icon; sign in again if that context requests it.
3. Confirm the existing activity remains visible in the Home Screen app. Then test offline reopening and a user-created activity, followed by returning online and checking the same activity in Supabase without duplicates.

Apple's current instructions: https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios . Do not mark the checks below from desktop automation.

- [x] Open the deployed real URL in Safari; Google login and original activity/synced status confirmed by owner, 2026-10-18.
- [x] Add to Home Screen and open from its icon; confirmed by owner, 2026-10-18.
- [ ] Explicit visual inspection of icon/name, standalone display and safe areas on the physical device.
- [ ] Start at a backdated time, capture now, spend 20 seconds selecting; end remains the tap timestamp.
- [ ] Close while picker is open; reopen, pending + cursor intact; make next capture.
- [x] Open online once, airplane mode with Wi-Fi off, close/reopen from Home Screen, capture/assign, close/reopen again; owner confirmed local persistence, 2026-10-18.
- [x] Return online / foreground and reach synced status; owner confirmed, and scoped Supabase read verified the offline test interval exists exactly once, 2026-10-18.
- [ ] Edit an existing interval while offline and verify resynchronization.
- [ ] Long open interval / overnight / several background days: recomputed from timestamps.
- [ ] Keyboard open in note field: scroll to save CTA; no lost focus or hidden button.
- [ ] Large Text / browser text zoom, portrait and landscape: all controls accessible, no horizontal overflow at 375–440 CSS px.
- [ ] Timeline tiny segments remain proportionally accurate; edit through chronological list.
- [ ] Edit, split, merge adjacent intervals, preview shared boundaries, delete, restore and undo.
- [ ] Restore into a newly used browser profile; category IDs / intervals / cursor return with no duplicates.
- [ ] Save JSON via Files / iCloud manually and open it again; Thai CSV opens correctly in Excel.
- [ ] Storage unavailable / full displays error and never claims saved or moves cursor.
- [ ] Change device clock backwards: warning; fix open cursor in settings; no negative activity.
- [ ] Change reporting timezone; Bangkok and 23/25-hour DST dates sum correctly.
- [ ] Log out with pending queue; export option and original account namespace retained.
- [ ] A new build prompts for update; no reload during capture or unsaved editor; export before updating.
- [ ] Upgrade from an older DB version without losing data or outbox (first release has only schema v1).
- [ ] Two devices at same base revision: later sender conflicts; original local data and server data both exportable.

Record date, device/iOS version and actual result beside each item. Never mark these done from desktop screenshots alone.

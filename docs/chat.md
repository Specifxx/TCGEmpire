# Live chat pilot (Rift Compare, owner 2026-11-18)

`/chat`: signed-in, email-verified members post; anyone reads. Two rooms (Riftbound, General). No DMs, no links, no images.

- **Switch:** `CHAT_MODE` in `src/lib/chat/core.ts` ("off" ships; flip to "on" in its own change). The Counter row `chat-off` turns it off
  whatever the constant says: the ops monitor sets it at 75% of the month's Neon compute allowance and clears it below 60%
  (`chatShouldBeOff`, check "Main database: monthly transfer"); an admin can POST `/api/admin/chat {action:"off"|"on"}`.
- **Store:** table `ChatMessage` (+ `ChatBan`) on the operational database, private. Read = `take 50` on `(room, createdAt)`, held by the CDN
  5 s (public, no cookie), so the database sees about one read per room per 5 s. The browser polls every 6 s while the panel is open AND the
  tab visible, backing off to 30 s when nothing is new. A send deletes rows older than 7 days (about one send in twenty).
- **Rules:** 280 characters, no links or contact details, the forum's hold list, no shouting or mashing, 3 s between messages, 10 a minute,
  120 an hour per member (per instance), names as "First L.".
- **Moderation:** Report (3 reports hide a message), `/api/admin/chat` (admin session, same-origin): `hide`, `restore`, `mute` (days or
  forever; hides their messages), `off`/`on`. Ask Claude to run one.
- **Not in:** the quick view, any pop-up, the sitemap (noindex), the sister sites.
- **Measure:** compute hours are in the monitor's summary line ("compute X of 100 CU-hours"); judge a week of them before widening.

# bad_planner v1

V1 stores one persistent day. It has no dates, yesterday, tomorrow, or timezone conversion. Every edit changes the schedule shown on the next page load.

## Agreed interaction rules

- Hour grid; 15-minute precision and minimum duration.
- Drag the left handle or use its arrow keys to move while preserving duration. Use minus/plus to change the end, or the dialog to edit name/start/end.
- Moving and creating first try the requested position, push flexible collisions later, and skip locked blocks. If later placement cannot fit, try earlier placement and an upward cascade. Never split or shorten displaced events; preserve their relative order. Stop at gaps that absorb the cascade.
- Equal-duration time-dialog edits count as moves. Duration changes count as resizes: anchor the exact requested bounds, bump preceding collisions up for an earlier start, and push following collisions down for a later end. Both ends can expand independently. Resizing cannot cross a lock; reject rather than reposition the resized event.
- New events start unlocked. A visible lock icon toggles protection without rearranging anything. Locked events have a subtly different background and disabled drag/duration/time controls. Rename and confirmed deletion remain available. Unlock before changing timing, including in the same API request.
- Preview the complete cascade while dragging. Invalid drops show an invalid block and leave the schedule unchanged. Dialogs show actual resolved placement and all displaced event times before saving. Save on release, button click or dialog submission; never fetch on every pointer movement.
- Nothing crosses midnight. A failed edit saves no part of the rearrangement. No Undo in v1.
- Shortening and deletion leave existing gaps. The normal view shows 06:00–22:00; the full-day button exposes the entire day.

## Architecture and consistency

React + TypeScript + Vite talks to a Go HTTP server through same-origin `/api` calls. Development uses the Vite proxy. PostgreSQL uses `planner_dev` locally and `planner` in production. Backend executes an idempotent initial schema at startup.

`users` own `events`. Events use a locked boolean and start/end integers in minutes since midnight (0–1440). Sessions use hashed random tokens and HttpOnly SameSite cookies. Passwords use bcrypt. Non-read requests require the configured APP_ORIGIN, including auth requests.

Every mutation sends only the changed event's name/start/end, plus the schedule version in `If-Match`. IDs are in the URL. A user-row lock serializes updates; Go calculates the complete cascade in one transaction. A deferred PostgreSQL exclusion constraint independently prohibits overlapping events. Return the authoritative schedule and incremented version. A stale edit receives 409 and the client reloads instead of overwriting someone else's work.

The frontend mirrors the cascade for visual previews and the explicitly labelled unsaved demo. Go is authoritative for saved schedules.

HTTP requests already run concurrently in Go. Additional goroutines handle graceful shutdown and expired-session cleanup. Cascades stay sequential inside their transaction.

## Next iterations

1. Expand BE unit tests (15 shared scheduling cases now implemented): table-driven cascade fixtures for gaps, chained collisions, both directions, adjacency, midnight, fallback and invalid input. Property checks for preserved duration/order/non-overlap. Integration checks for ownership, concurrent edits and rollback.
2. FE unit tests: drag snapping and cancellation, keyboard moves, duration limits, modal validation, save errors and stale-version refresh. Shared cascade fixtures to detect client/server drift.
3. Weekly templates: a schedule/day owner key, day-level locks and versions, transactional copy-day operation. Separate templates from dated instances before adding exceptions.
4. Timezones: IANA timezone per user; explicitly decide how recurring templates behave across DST before converting minutes into real instants.
5. Optional Undo and a one-click “running late” action.

Before public deployment: add reverse-proxy authentication throttling, password recovery and email verification, managed migrations, observability, backups and a deployment configuration. These are outside the requested local v1.

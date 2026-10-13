# bad_planner v1

A daily routine that can bend when something takes longer than expected. The daily template repeats by definition: events store wall-clock minutes, not dates. No timezone conversion in v1.

## Interaction decisions

- Hour grid, with 15-minute snapping and a 15-minute minimum duration.
- Drag the left handle to move an event while preserving its duration. Arrow keys on that handle do the same in 15-minute steps.
- Right-side minus/plus buttons change the end by 15 minutes. Click the event to edit its name, start, or end.
- Keep the selected event anchored. Other events preserve duration and relative order. Only collisions move; a cascade stops as soon as a gap absorbs it. Deleting or shortening does not pull later events forward.
- Moving an event prefers pushing collisions down. If there is not enough room below, try pushing them up. If neither fits, reject the whole edit.
- Moving only the start earlier pushes collisions upward. Extending the end pushes them downward. Moving both bounds uses the downward rule. A time-dialog edit does not silently switch directions at a day boundary.
- Events never cross midnight. Reject edits rather than losing or shortening another event.
- Preview the cascade while dragging. Save on release; button and dialog edits save immediately. No fetch on every pointer movement.
- The normal view shows 06:00–22:00; the full-day button exposes the entire day.

## Architecture and consistency

React + TypeScript + Vite talks to a Go HTTP server through same-origin `/api` calls. Development uses the Vite proxy. PostgreSQL uses `planner_dev` locally and `planner` in production. Backend executes an idempotent initial schema at startup.

`users` own `events`. Events use start/end integers in minutes since midnight (0–1440). Sessions use hashed random tokens and HttpOnly SameSite cookies. Passwords use bcrypt. Non-read requests require the configured APP_ORIGIN, including auth requests.

Every mutation sends only the changed event's name/start/end, plus the schedule version in `If-Match`. IDs are in the URL. A user-row lock serializes updates; Go calculates the complete cascade in one transaction. A deferred PostgreSQL exclusion constraint independently prohibits overlapping events. Return the authoritative schedule and incremented version. A stale edit receives 409 and the client reloads instead of overwriting someone else's work.

The frontend mirrors the cascade for visual previews and the explicitly labelled unsaved demo. Go is authoritative for saved schedules.

HTTP requests already run concurrently in Go. Additional goroutines handle graceful shutdown and expired-session cleanup. Cascades stay sequential inside their transaction.

## Next iterations

1. BE unit tests: table-driven cascade fixtures for gaps, chained collisions, both directions, adjacency, midnight, fallback and invalid input. Property checks for preserved duration/order/non-overlap. Integration checks for ownership, concurrent edits and rollback.
2. FE unit tests: drag snapping and cancellation, keyboard moves, duration limits, modal validation, save errors and stale-version refresh. Shared cascade fixtures to detect client/server drift.
3. Weekly templates: a schedule/day owner key, day-level locks and versions, transactional copy-day operation. Separate templates from dated instances before adding exceptions.
4. Timezones: IANA timezone per user; explicitly decide how recurring templates behave across DST before converting minutes into real instants.
5. Undo for cascades; optional pinned events and a one-click “running late” action.

Before public deployment: add reverse-proxy authentication throttling, password recovery and email verification, managed migrations, observability, backups and a deployment configuration. These are outside the requested local v1.

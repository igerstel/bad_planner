# V1 verification

Validated locally against PostgreSQL `planner_dev` on October 12, 2026.

- React/TypeScript production build passed.
- Go build and `go vet ./...` passed.
- API smoke checks passed: registration, login, logout, authenticated CRUD, persistence, downward cascade, upward start expansion, gaps absorbing cascades, rollback when a day is full, invalid 15-minute inputs, stale schedule versions, cross-account isolation and origin rejection.
- Browser checks passed: desktop and 390px mobile layouts, no horizontal mobile overflow, 15-minute duration buttons, time-dialog editing, keyboard rearrangement with cascading shifts, account creation, saved event creation and persistence after reload.
- Browser console contained expected unauthenticated `/api/me` 401 responses during session discovery; no JavaScript runtime errors were observed.
- Physical pointer dragging and edge scrolling are implemented but were not exercised with real pointer input: the installed browser tool denies `Input.dispatchMouseEvent`. Keyboard movement and the same cascade calculations were exercised. Verify pointer/touch dragging manually before release.
- Temporary smoke accounts and their events were removed after verification.

The initial v1 deferred BE/FE unit suites. The refinement below adds focused scheduling tests; broader coverage is planned in PLAN.md.

## Lock-aware UX refinement — October 13, 2026

- Added 15 shared scheduling fixtures covering locks, directional cascades, exact moves, midnight fallback, two-sided resizing, gaps and invalid edits. Go tests and the frontend fixture check passed; both resolvers leave their input unchanged.
- API smoke checks passed against `planner_dev`: migrated lock column, lock persistence across login, guarded timing even when the request also unlocks, locked rename/delete, skipped locks, adjusted move placement, resize rejection and atomic rollback. Temporary accounts were removed.
- Browser checks passed: lock toggle, changed background, disabled drag/duration controls, disabled dialog times, editable names, resolved placement and full-cascade previews for creation over a lock, and mobile layout without horizontal overflow.
- The existing physical pointer/touch verification limit still applies.

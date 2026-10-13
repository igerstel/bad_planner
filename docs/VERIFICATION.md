# V1 verification

Validated locally against PostgreSQL `planner_dev` on October 12, 2026.

- React/TypeScript production build passed.
- Go build and `go vet ./...` passed.
- API smoke checks passed: registration, login, logout, authenticated CRUD, persistence, downward cascade, upward start expansion, gaps absorbing cascades, rollback when a day is full, invalid 15-minute inputs, stale schedule versions, cross-account isolation and origin rejection.
- Browser checks passed: desktop and 390px mobile layouts, no horizontal mobile overflow, 15-minute duration buttons, time-dialog editing, keyboard rearrangement with cascading shifts, account creation, saved event creation and persistence after reload.
- Browser console contained expected unauthenticated `/api/me` 401 responses during session discovery; no JavaScript runtime errors were observed.
- Physical pointer dragging and edge scrolling are implemented but were not exercised with real pointer input: the installed browser tool denies `Input.dispatchMouseEvent`. Keyboard movement and the same cascade calculations were exercised. Verify pointer/touch dragging manually before release.
- Temporary smoke accounts and their events were removed after verification.

BE/FE unit suites are deferred until after v1, per the requested scope. Planned coverage is in PLAN.md.

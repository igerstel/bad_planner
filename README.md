# bad_planner

A flexible daily planner built with Go, PostgreSQL, React and TypeScript. Drag an event, and conflicting events make room. A daily routine repeats every day.

## Run locally

Requires Go 1.24+, Node 22+ and PostgreSQL with permission to install `btree_gist`.

```sh
createdb planner_dev
make install
```

In two terminals:

```sh
make dev-api
```

```sh
make dev-web
```

Open http://localhost:5173. Create an account or try the clearly labelled interactive demo. Demo data stays in memory and is never saved.

Backend defaults to `postgres://localhost/planner_dev?sslmode=disable`. Override `DATABASE_URL` for password-based connections. Environment variables are read from the process; `.env` files are not automatically loaded. See `.env.example`.

If using the workspace-local compiler downloaded during development:

```sh
make dev-api GO="$PWD/.tools/go/bin/go"
```

## Build and serve

```sh
make build
cd backend
APP_ORIGIN=http://localhost:8080 ../.tools/planner
```

Open http://localhost:8080. The Go server serves the built frontend from `../web/dist`, so run it from `backend/`.

For production set `DATABASE_URL` to a TLS-enabled connection to **planner**, `APP_ORIGIN` to your HTTPS origin and `PORT` as needed. HTTPS origins enable Secure cookies. Use a reverse proxy and the deployment prerequisites in [the plan](docs/PLAN.md) before exposing it publicly.

## Scheduling rules

Only overlapping events shift, preserving duration and order. Dragging prefers shifting down and can fall back upward if the bottom is full. Editing only a start backward bumps collisions up; extending the end pushes them down. Edits that cannot fit within the day are rejected atomically. Shortening or deleting leaves useful gaps.

Use the left handle to drag (or press ↑/↓), the right buttons to change duration by 15 minutes, and the event body to edit name and times. Use “Show all 24 hours” for events outside the default daytime view.

Each edit sends only that event; the backend calculates and saves all resulting shifts. PostgreSQL also enforces non-overlap. Stale edits from another tab reload the schedule for retry.

## Verification

`make check` type-checks and builds the frontend and runs Go vet. BE and FE unit suites are intentionally deferred until after v1. The implementation plan includes the proposed cases.

Stack references: [React TypeScript](https://react.dev/learn/typescript), [pgx transactions](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool).

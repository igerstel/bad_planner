# bad_planner

A flexible daily planner built with Go, PostgreSQL, React and TypeScript. Drag an event, and conflicting events make room. V1 stores one persistent day with no date or timezone concepts.

## Run locally

Requires Go 1.24+, Node 22+ and PostgreSQL with permission to install `btree_gist`.

```sh
createdb planner_dev
make install
```

Start both servers in one terminal:

```sh
make dev
```

API and web logs have `[api]` / `[web]` prefixes. Ctrl+C stops both servers. If either server fails, the other stops too. React changes reload automatically; restart `make dev` after changing Go code. Separate `make dev-api` and `make dev-web` commands remain available.

Open http://localhost:5173. Create an account or try the clearly labelled interactive demo. Demo data stays in memory and is never saved.

Backend defaults to `postgres://localhost/planner_dev?sslmode=disable`. Override `DATABASE_URL` for password-based connections. Environment variables are read from the process; `.env` files are not automatically loaded. See `.env.example`.

### If your terminal says `command not found: go`

Install Go on macOS with Homebrew:

```sh
brew install go
```

Reopen the VS Code terminal, then verify:

```sh
go version
```

The Makefile uses Go from your PATH, falling back to `.tools/go/bin/go` if the workspace-local compiler is present. That local compiler is ignored by Git and is not included when cloning the repository. It lets `make dev` run in the original workspace without a system install, but does not make the bare `go` command available in your shell. Override the compiler with `make dev GO=/absolute/path/to/go` if needed.

## Build and serve

```sh
make build
cd backend
APP_ORIGIN=http://localhost:8080 ../.tools/planner
```

Open http://localhost:8080. The Go server serves the built frontend from `../web/dist`, so run it from `backend/`.

For production set `DATABASE_URL` to a TLS-enabled connection to **planner**, `APP_ORIGIN` to your HTTPS origin and `PORT` as needed. HTTPS origins enable Secure cookies. Use a reverse proxy and the deployment prerequisites in [the plan](docs/PLAN.md) before exposing it publicly.

## Scheduling rules

Moves preserve duration, push collisions later, and skip locked events. When later placement cannot fit, try earlier space. New events use the same rules. A lock icon fixes an event's timing until unlocked; locked events also have a different background.

Resizing keeps exact requested bounds: earlier starts bump preceding events up, later ends push following events down. Displaced events skip locks without splitting or shortening. A resize cannot cross a lock. Dialogs preview adjusted placement and the full cascade before saving. Impossible edits leave the entire schedule unchanged. No Undo in v1.

Use the left handle to drag (or press ↑/↓), the right buttons to change duration by 15 minutes, and the event body to edit name and times. Use “Show all 24 hours” for events outside the default daytime view.

Each edit sends only that event; the backend calculates and saves all resulting shifts. PostgreSQL also enforces non-overlap. Stale edits from another tab reload the schedule for retry.

## Verification

`make check` runs shared scheduling fixtures, type-checks and builds the frontend, and runs Go tests and vet. The Go scheduling suite covers 15 agreed cases using shared fixtures in `backend/testdata/schedule.json`. Run `cd backend && go test ./...`. Run `npm run check:schedule --prefix web` to verify the frontend resolver against the same fixtures; broader BE/FE suites remain follow-up work. The implementation plan includes the proposed cases.

Stack references: [React TypeScript](https://react.dev/learn/typescript), [pgx transactions](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool).

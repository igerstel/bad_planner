.PHONY: install dev dev-web dev-api build check
GO ?= $(shell command -v go 2>/dev/null || echo "$(CURDIR)/.tools/go/bin/go")
install:
	cd backend && $(GO) mod download
	cd web && npm ci
dev:
	node tools/dev.mjs "$(GO)"
dev-web:
	cd web && npm run dev
dev-api:
	cd backend && $(GO) run .
build:
	mkdir -p .tools
	cd web && npm run build
	cd backend && $(GO) build -o ../.tools/planner .
check:
	cd web && npm run check:schedule
	cd web && npm run build
	cd backend && $(GO) test ./...
	cd backend && $(GO) vet ./...

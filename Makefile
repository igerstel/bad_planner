.PHONY: install dev-web dev-api build check
GO ?= go
install:
	cd backend && $(GO) mod download
	cd web && npm ci
dev-web:
	cd web && npm run dev
dev-api:
	cd backend && $(GO) run .
build:
	mkdir -p .tools
	cd web && npm run build
	cd backend && $(GO) build -o ../.tools/planner .
check:
	cd web && npm run build
	cd backend && $(GO) vet ./...

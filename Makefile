USER_ID ?= $(shell id -u)

export USER
export USER_ID

COMPOSE := docker compose
RUN := $(COMPOSE) run --rm dev

.PHONY: help setup check lint fmt fmt-fix test typecheck run

help:
	@echo "Available commands:"
	@echo "  make setup      Install locked dependencies with npm ci"
	@echo "  make check      Run all project checks"
	@echo "  make lint       Run Oxlint"
	@echo "  make fmt        Check formatting"
	@echo "  make fmt-fix    Format files"
	@echo "  make test       Run runtime tests"
	@echo "  make typecheck  Run TypeScript checks"
	@echo "  make run        Open a shell in the container"

setup:
	$(RUN) npm ci

check:
	$(RUN) npm run check

lint:
	$(RUN) npm run lint

fmt:
	$(RUN) npm run fmt

fmt-fix:
	$(RUN) npm run fmt:fix

test:
	$(RUN) npm test

typecheck:
	$(RUN) npm run typecheck

run:
	$(RUN) bash

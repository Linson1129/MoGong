# MoGong repository Makefile.
#
# One entry point per task so the README can point at `make <target>` without spelling out the
# working directory and the right interpreter each time. The targets below are deliberately thin:
# they change directory, run the command, and leave. Anything more elaborate belongs in a script.

.PHONY: help dev test test-backend test-frontend lint lint-backend lint-frontend fixture smoke sites protect

help:
	@echo "Available targets:"
	@echo "  dev            start backend (8100) and frontend (3000) in parallel"
	@echo "  test           run both test suites"
	@echo "  test-backend   run pytest from backend/"
	@echo "  test-frontend  run vitest from frontend/"
	@echo "  lint           run ruff and eslint"
	@echo "  lint-backend   run ruff on backend/ and scripts/"
	@echo "  lint-frontend  run eslint on frontend/"
	@echo "  fixture        regenerate fixtures/cases/geometry-truth-table.json"
	@echo "  smoke          run the smoke test"
	@echo "  sites          stage browser CPython, then build the static export in frontend/out"
	@echo "  protect        apply main-branch protection (needs Pro or a public repo)"

dev:
	@scripts/dev.sh

test: test-backend test-frontend

test-backend:
	@cd backend && .venv/bin/python -m pytest -q

test-frontend:
	@cd frontend && npx vitest run

lint: lint-backend lint-frontend

lint-backend:
	@cd backend && .venv/bin/python -m ruff check app tests && .venv/bin/python -m ruff format --check app tests
	@cd scripts && ../backend/.venv/bin/python -m ruff check . && ../backend/.venv/bin/python -m ruff format --check .

lint-frontend:
	@cd frontend && npx eslint .

fixture:
	@backend/.venv/bin/python scripts/generate_geometry_fixture.py

smoke:
	@scripts/smoke_test.sh

# Ordering matters: Next copies public/ into out/ as it finds it, so the wasm tree staged here is
# what ends up in the published bundle.
sites:
	@backend/.venv/bin/python scripts/stage_wasm.py
	@backend/.venv/bin/python scripts/stage_skill.py
	@cd frontend && NEXT_PUBLIC_MOGONG_TARGET=sites npm run build

protect:
	@scripts/setup_branch_protection.sh

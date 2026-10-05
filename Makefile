SHELL := /bin/bash
.DEFAULT_GOAL := help

PROJECT := bun-opds-server
PROJECT_TMP_HELPER := ./scripts/project-tmp.sh
RUN := ./scripts/with-project-tmp.sh

export PROJECT
ifneq ($(origin PROJECT_TMP_BASE),undefined)
export PROJECT_TMP_BASE
endif
ifneq ($(origin PROJECT_TMP_ROOT),undefined)
export PROJECT_TMP_ROOT
endif
ifneq ($(origin PROFILE_ROOT),undefined)
export PROFILE_ROOT
endif

.PHONY: help paths tmp-init install start dev typecheck test check clean

help:
	@printf '%s\n' \
	  'paths     print the resolved project-owned cache/build/runs layout' \
	  'tmp-init  create the resolved project-owned cache/build/runs layout' \
	  'install   install locked dependencies with project-owned Bun/npm caches' \
	  'start     run the server with isolated project-owned temporary storage' \
	  'dev       run the watch server with isolated project-owned temporary storage' \
	  'typecheck run TypeScript validation in an isolated run directory' \
	  'test      run the Bun test suite in an isolated run directory' \
	  'check     run typecheck and tests' \
	  'clean     reset this project cache/build/tests/logs/runs; requires CONFIRM_CLEAN=$(PROJECT)'

paths:
	@bash "$(PROJECT_TMP_HELPER)" paths

tmp-init:
	@bash "$(PROJECT_TMP_HELPER)" init

install: tmp-init
	@$(RUN) install bun install --frozen-lockfile

start: tmp-init
	@$(RUN) start bun run index.ts

dev: tmp-init
	@$(RUN) dev bun run --watch index.ts

typecheck: tmp-init
	@$(RUN) typecheck bun x tsc --noEmit

test: tmp-init
	@./scripts/test-profile.sh

check: typecheck test

clean:
	@test "$(CONFIRM_CLEAN)" = "$(PROJECT)" || { echo 'Refusing cleanup: set CONFIRM_CLEAN=$(PROJECT) after confirming no active job uses the root' >&2; exit 1; }
	@set -eu; root="$$(bash "$(PROJECT_TMP_HELPER)" paths | sed -n 's/^PROJECT_TMP_ROOT=//p')"; \
	  case "$$root" in /*/$(PROJECT)) ;; *) echo 'Refusing unexpected project scratch root' >&2; exit 1;; esac; \
	  test ! -L "$$root" && test -d "$$root" && test -O "$$root" || { echo 'Refusing unsafe project scratch root' >&2; exit 1; }; \
	  rm -rf -- "$$root/cache" "$$root/build" "$$root/tests" "$$root/logs" "$$root/runs"; \
	  mkdir -p "$$root/cache" "$$root/build" "$$root/tests" "$$root/logs" "$$root/runs"

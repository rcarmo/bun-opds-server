# bun-opds-server

Read-only multi-library OPDS server for Calibre, implemented in TypeScript for Bun.

## Development

- Keep changes small and follow YAGNI.
- Run `make check` before commits. Use the Makefile targets rather than direct Bun commands so subprocesses inherit the required cache and temporary paths.
- Commit as `Rui Carmo <rui.carmo@gmail.com>` and configure both local and global Git identity before committing.
- Never rebase; merge concurrent upstream changes with `git pull --no-rebase`.

## Project-owned caches and temporary files

The canonical project name is `bun-opds-server`. The vendored `scripts/project-tmp.sh` snapshots the original `TMPDIR` and resolves the root once before any child temp export. An explicit `PROJECT_TMP_BASE` selects `$PROJECT_TMP_BASE/bun-opds-server`; an explicit compatible `PROJECT_TMP_ROOT` may select the same directory. Invalid, unsafe, empty, or conflicting overrides fail closed.

Without an override, CI selects the first usable project-named root under `${RUNNER_TEMP}`, the original `${TMPDIR}`, then `/tmp`, regardless of a workspace mount. Local runs select usable `/workspace/tmp/bun-opds-server`, then `/tmp/bun-opds-server`.

The selected root always has the same declared layout:

- `CACHE_ROOT=$PROJECT_TMP_ROOT/cache`
- `BUILD_ROOT=$PROJECT_TMP_ROOT/build`
- `TEST_ROOT=$PROJECT_TMP_ROOT/tests`
- `LOG_ROOT=$PROJECT_TMP_ROOT/logs`
- `RUN_ROOT=$PROJECT_TMP_ROOT/runs`

Tool caches use `cache/<tool>/`. Each command receives a unique `runs/<purpose>/<run-id>/tmp` directory through `scripts/with-project-tmp.sh`, which exports the stable roots plus `BUN_INSTALL_CACHE_DIR`, `BUN_TMPDIR`, `npm_config_cache`, `XDG_CACHE_HOME`, `TMPDIR`, `TMP`, and `TEMP`. Tests that use `node:os.tmpdir()` therefore remain inside their owned run directory. Child `TMPDIR` values cannot recursively create nested project roots.

Never use bare `/tmp`, home-directory caches, ad-hoc top-level workspace paths, or source/evidence directories for disposable output. Do not weaken symlink or ownership checks. Durable logs, profiles, test binaries, release receipts, datasets, or other retained evidence do not belong under this disposable root.

Retained Bun test logs, CPU/heap profiles, and matching metadata live at `/workspace/analysis/bun-opds-server/test-profiles/<run-id>/`, outside disposable scratch. `make test` and `make check` must use `scripts/test-profile.sh`. Because Bun 1.4.2 ignores the CLI profile flags for `bun test`, the script preloads `scripts/test-profile-preload.ts`: `bun:jsc.profile()` spans the real test process and a final `afterAll` hook writes `Bun.generateHeapSnapshot()`. Do not replace this with `startSamplingProfiler`. The deterministic `scripts/profile-workload.ts` capture remains supplemental, not a substitute for the real test profile. After every run, inspect cumulative sampled CPU and the final live heap object/self-size totals. The heap snapshot is not cumulative allocation history and exposes neither `alloc_space` nor `alloc_objects`; keep that limitation explicit, report empty or undersampled profiles, and reduce avoidable application allocations without weakening correctness.

`make clean CONFIRM_CLEAN=bun-opds-server` may remove only this project's `cache`, `build`, `tests`, `logs`, and `runs` trees. Run it only after confirming no active process uses them. It must not remove another project's files or retained evidence.

GitHub-hosted workflows initialize compatible `PROJECT_TMP_BASE=$RUNNER_TEMP` and `PROJECT_TMP_ROOT=$RUNNER_TEMP/bun-opds-server` values in their first runner step; other external hosts may use the documented CI fallbacks. CI must use the vendored helper or equivalent environment mapping and must never depend on `/workspace/Makefile`.

## Deployment

The production container is part of the DiskStation Portainer `books` stack. Update the Gitea `Home/portainer-stacks` source of truth before redeploying. DiskStation stack updates can outlive the client request; wait several minutes before one verification pass and avoid aggressive polling or blind retries.

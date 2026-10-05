<!-- RUI-PROFILE-LIFECYCLE-20261005 -->
## Current profiling and cleanup rule — supersedes older text below

Rui's explicit rule: **profile and tune during pre-release tests; remove profiling data immediately after analysis/use.** Ordinary development tests do not require profiling on every run. Targeted diagnostic profiling is optional when useful and follows the same disposal rule.

- During pre-release verification, capture CPU and heap/allocation behaviour, analyse hotspots and tune avoidable allocations/repeated work. Compare equivalent workloads without weakening correctness/security/numerical contracts. For Go, inspect CPU, alloc_space and alloc_objects; coverage alone is not profiling.
- Keep captures and matching artifacts only while the current analysis needs them. Once used, immediately delete raw profiles, traces, matching test binaries, temporary fixtures and disposable logs, including failed/probe artifacts after diagnosis. Retain only concise conclusions and important measurements/limitations. Do not keep indefinite raw archives or copy them into exports/reports/evidence to evade cleanup.
- Remove all completed disposable cache/build/test/run data promptly. Never delete files still in use: finish or safely pause the owning job and clean at a safe boundary. Preserve source, installed toolchains, durable datasets/checkpoints and intentional release assets. Minimise disk usage; no random exports or redundant snapshots.
- This rule overrides **every conflicting older paragraph in this file and linked local guidance**, including “profile every test”, “unprofiled tests prohibited”, “retain all raw evidence”, “never delete profiles” and cleanup exclusions based only on an evidence/profiles directory name. Update helper/CI cleanup behaviour accordingly; do not weaken pre-release analysis.
- Existing no-agent-contact and execution-pause rules remain unchanged. This policy grants no unsolicited coordination or automatic job restart.
<!-- /RUI-PROFILE-LIFECYCLE-20261005 -->


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

Never use bare `/tmp`, home-directory caches, ad-hoc top-level workspace paths, or source/conclusion directories for disposable output. Do not weaken symlink or ownership checks. Durable release receipts, datasets, and concise profiling conclusions do not belong under this disposable root; raw profiles, traces, logs, test binaries, fixtures, and completed run directories are disposable and must be removed after use.

Ordinary `make test` and `make check` runs are not profiled. Pre-release verification uses `make pre-release`, which runs type checking, profiles the real Bun test process, profiles the deterministic representative workload, analyses both, retains only a concise conclusion under `/workspace/analysis/bun-opds-server/test-profiles/<run-id>/analysis.md`, and deletes raw CPU/heap captures plus logs immediately. Targeted diagnostic profiling follows the same disposal rule. Because Bun 1.4.2 ignores CLI profile flags for `bun test`, `scripts/test-profile-preload.ts` uses `bun:jsc.profile()` across the real test process and an `afterAll` hook writes the final `Bun.generateHeapSnapshot()`; do not replace this with `startSamplingProfiler`. The deterministic `scripts/profile-workload.ts` capture remains supplemental. Inspect cumulative sampled CPU and final live heap object/self-size totals, tune only justified avoidable work, and state that the heap snapshot is not cumulative allocation history and exposes neither `alloc_space` nor `alloc_objects`.

`make clean CONFIRM_CLEAN=bun-opds-server` must remove only owned completed disposable cache/build/tests/logs/runs and profiling output after use. Verify no active consumer first; preserve other projects, source, durable assets and concise conclusions.

GitHub-hosted workflows initialize compatible `PROJECT_TMP_BASE=$RUNNER_TEMP` and `PROJECT_TMP_ROOT=$RUNNER_TEMP/bun-opds-server` values in their first runner step; other external hosts may use the documented CI fallbacks. CI must use the vendored helper or equivalent environment mapping and must never depend on `/workspace/Makefile`.

## Deployment

The production container is part of the DiskStation Portainer `books` stack. Update the Gitea `Home/portainer-stacks` source of truth before redeploying. DiskStation stack updates can outlive the client request; wait several minutes before one verification pass and avoid aggressive polling or blind retries.

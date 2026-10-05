# bun-opds-server

Read-only multi-library OPDS server for Calibre, implemented in TypeScript for Bun.

## Development

- Keep changes small and follow YAGNI.
- Run `make check` before commits. Use the Makefile targets rather than direct Bun commands so subprocesses inherit the required cache and temporary paths.
- Commit as `Rui Carmo <rui.carmo@gmail.com>` and configure both local and global Git identity before committing.
- Never rebase; merge concurrent upstream changes with `git pull --no-rebase`.

## Project-owned caches and temporary files

The canonical project name is `bun-opds-server`. Resolve `PROJECT_TMP_ROOT` once, before changing child temp variables, through the vendored `scripts/project-tmp.sh` helper. Resolution order is:

1. an explicit `PROJECT_TMP_ROOT` that is usable, absolute, not a symlink, and ends in `/bun-opds-server`; an invalid explicit override fails closed;
2. writable `/workspace/tmp/bun-opds-server`;
3. `${RUNNER_TEMP}/bun-opds-server`;
4. the original `${TMPDIR}/bun-opds-server`;
5. the platform POSIX temp root `/tmp/bun-opds-server`.

The selected root always has the same declared layout:

- `CACHE_ROOT=$PROJECT_TMP_ROOT/cache`
- `BUILD_ROOT=$PROJECT_TMP_ROOT/build`
- `RUN_ROOT=$PROJECT_TMP_ROOT/runs`

Tool caches use `cache/<tool>/`. Each command receives a unique `runs/<purpose>/<run-id>/tmp` directory through `scripts/with-project-tmp.sh`, which exports `BUN_INSTALL_CACHE_DIR`, `BUN_TMPDIR`, `npm_config_cache`, `XDG_CACHE_HOME`, `TMPDIR`, `TMP`, and `TEMP`. Tests that use `node:os.tmpdir()` therefore remain inside their owned run directory. The helper resolves from the inherited environment only once, so child `TMPDIR` values cannot recursively create nested project roots.

Never use bare `/tmp`, home-directory caches, ad-hoc top-level workspace paths, or source/evidence directories for disposable output. Do not weaken symlink or ownership checks. Durable logs, profiles, test binaries, release receipts, datasets, or other retained evidence do not belong under this disposable root.

Retained Bun test logs, representative CPU/heap profiles, and matching metadata live at `/workspace/analysis/bun-opds-server/test-profiles/<run-id>/`, outside disposable scratch. `make test` and `make check` must use `scripts/test-profile.sh`. Bun 1.4.2 does not emit requested profiles for `bun test`, so the script records that limitation and profiles the deterministic `scripts/profile-workload.ts` application workload after the suite. After every run, inspect cumulative CPU time and heap allocation space/object hotspots; report empty or undersampled profiles and reduce avoidable application allocations without weakening correctness.

`make clean CONFIRM_CLEAN=bun-opds-server` may remove only this project's `cache`, `build`, and `runs` trees. Run it only after confirming no active process uses them. It must not remove another project's files or retained evidence.

GitHub-hosted workflows explicitly set `PROJECT_TMP_ROOT=${{ runner.temp }}/bun-opds-server`; other external hosts may use the documented generic fallbacks. CI must use the vendored helper or equivalent environment mapping and must never depend on `/workspace/Makefile`.

## Deployment

The production container is part of the DiskStation Portainer `books` stack. Update the Gitea `Home/portainer-stacks` source of truth before redeploying. DiskStation stack updates can outlive the client request; wait several minutes before one verification pass and avoid aggressive polling or blind retries.

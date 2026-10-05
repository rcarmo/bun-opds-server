#!/usr/bin/env bash
set -euo pipefail

project="bun-opds-server"
workspace_profile_root="/workspace/analysis/${project}/test-profiles"
if [[ -f /workspace/AGENTS.md ]]; then
  if [[ -n "${PROFILE_ROOT:-}" && "$PROFILE_ROOT" != "$workspace_profile_root" ]]; then
    echo "PROFILE_ROOT must be $workspace_profile_root on the Piclaw workspace host" >&2
    exit 1
  fi
  profile_root="$workspace_profile_root"
else
  : "${PROFILE_ROOT:?set PROFILE_ROOT to retained evidence storage on this external host}"
  case "$PROFILE_ROOT" in /*) ;; *) echo "PROFILE_ROOT must be absolute" >&2; exit 1;; esac
  if [[ "$PROFILE_ROOT" == "$workspace_profile_root" ]]; then
    echo "set PROFILE_ROOT explicitly for this external host; the Piclaw default is not a fallback" >&2
    exit 1
  fi
  profile_root="$PROFILE_ROOT"
fi

run_id="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}}"
case "$run_id" in
  ''|*[!A-Za-z0-9._-]*)
    echo "RUN_ID must contain only letters, digits, dot, underscore, or dash" >&2
    exit 2
    ;;
esac

evidence_dir="${profile_root}/${run_id}"
if [[ -e "$evidence_dir" || -L "$evidence_dir" ]]; then
  echo "refusing to overwrite existing profile evidence: $evidence_dir" >&2
  exit 1
fi

ensure_owned_evidence_dir() {
  local path="$1"
  if [[ -L "$path" ]]; then
    echo "refusing symlink evidence path: $path" >&2
    exit 1
  fi
  if [[ -e "$path" ]]; then
    if [[ ! -d "$path" || ! -O "$path" ]]; then
      echo "evidence path must be an owned directory: $path" >&2
      exit 1
    fi
  else
    mkdir "$path"
  fi
}

umask 077
if [[ -f /workspace/AGENTS.md ]]; then
  ensure_owned_evidence_dir "/workspace/analysis"
  ensure_owned_evidence_dir "/workspace/analysis/${project}"
else
  profile_parent="$(dirname "$profile_root")"
  if [[ ! -d "$profile_parent" || -L "$profile_parent" || ! -O "$profile_parent" ]]; then
    echo "PROFILE_ROOT parent must be an existing owned directory: $profile_parent" >&2
    exit 1
  fi
fi
ensure_owned_evidence_dir "$profile_root"
ensure_owned_evidence_dir "$evidence_dir"
test_profiles_dir="$evidence_dir/test-processes"
ensure_owned_evidence_dir "$test_profiles_dir"

bun_version="$(bun --version)"
working_tree_dirty=false
if [[ -n "$(git status --porcelain)" ]]; then working_tree_dirty=true; fi

{
  printf 'project=%s\n' "$project"
  printf 'run_id=%s\n' "$run_id"
  printf 'started_at=%s\n' "$(date -u +%FT%TZ)"
  printf 'revision=%s\n' "$(git rev-parse HEAD)"
  printf 'bun_path=%s\n' "$(command -v bun)"
  printf 'bun_version=%s\n' "$bun_version"
  printf 'working_tree_dirty=%s\n' "$working_tree_dirty"
  printf 'test_cpu_sampling_interval_us=100\n'
  printf 'test_heap_capture=end-of-run Bun.generateHeapSnapshot()\n'
  printf 'representative_cpu_sampling_interval_us=100\n'
  printf 'representative_heap_sampling_interval_bytes=4096\n'
  printf 'test_workload=bun test\n'
  printf 'test_capture=bun:jsc.profile() async preload plus final afterAll heap snapshot\n'
  printf 'profile_workload=scripts/profile-workload.ts (4053 books, 250 search rounds, OPDS and HTML rendering)\n'
  printf 'test_binary=none (Bun interprets the TypeScript test suite)\n'
} > "$evidence_dir/metadata.txt"

test_bun_options="--preload=$PWD/scripts/test-profile-preload.ts"
if [[ -n "${BUN_OPTIONS:-}" ]]; then test_bun_options="${BUN_OPTIONS} ${test_bun_options}"; fi

set +e
OPDS_TEST_PROFILE_DIR="$test_profiles_dir" \
OPDS_TEST_CPU_INTERVAL_US=100 \
BUN_OPTIONS="$test_bun_options" \
RUN_ID="$run_id" \
  ./scripts/with-project-tmp.sh test bun test 2>&1 | tee "$evidence_dir/test.log"
test_status=${PIPESTATUS[0]}

RUN_ID="${run_id}-workload" ./scripts/with-project-tmp.sh profile-workload \
  bun \
    --cpu-prof \
    --cpu-prof-name=cpu.cpuprofile \
    --cpu-prof-dir="$evidence_dir" \
    --cpu-prof-interval=100 \
    --heap-prof-md \
    --heap-prof-name=heap.md \
    --heap-prof-dir="$evidence_dir" \
    --heap-prof-interval=4096 \
    scripts/profile-workload.ts 2>&1 | tee "$evidence_dir/profile-workload.log"
profile_status=${PIPESTATUS[0]}
set -e

status="$test_status"
if (( profile_status != 0 )); then status="$profile_status"; fi

actual_cpu_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name cpu.json -size +0c | wc -l)"
actual_heap_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name heap.json -size +0c | wc -l)"
actual_command_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name command.json -size +0c | wc -l)"
actual_error_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name capture-error.txt -size +0c | wc -l)"
test_analysis="$evidence_dir/test-analysis.md"
actual_analysis_status=0
if (( actual_cpu_count == 0 || actual_cpu_count != actual_heap_count || actual_cpu_count != actual_command_count || actual_error_count != 0 )); then
  printf 'Actual test profile capture failed: cpu=%s heap=%s command=%s errors=%s.\n' \
    "$actual_cpu_count" "$actual_heap_count" "$actual_command_count" "$actual_error_count" | tee "$test_analysis" >&2
  actual_analysis_status=1
else
  set +e
  RUN_ID="${run_id}-test-analysis" ./scripts/with-project-tmp.sh profile-analysis \
    bun run scripts/analyze-test-profiles.ts "$test_profiles_dir" "$test_analysis"
  actual_analysis_status=$?
  set -e
fi
if (( actual_analysis_status != 0 )); then
  status="$actual_analysis_status"
  if [[ ! -s "$test_analysis" ]]; then
    printf 'Actual test profile analysis failed with status %s.\n' "$actual_analysis_status" > "$test_analysis"
  fi
fi

cpu_profile="$evidence_dir/cpu.cpuprofile"
heap_profile="$evidence_dir/heap.md"
representative_analysis="$evidence_dir/representative-analysis.md"
representative_analysis_status=0
if [[ ! -s "$cpu_profile" || ! -s "$heap_profile" ]]; then
  printf 'Supplemental representative profile capture failed: CPU or heap profile is missing/empty.\n' \
    | tee "$representative_analysis" >&2
  representative_analysis_status=1
else
  set +e
  RUN_ID="${run_id}-workload-analysis" ./scripts/with-project-tmp.sh profile-analysis \
    bun run scripts/analyze-bun-profiles.ts "$cpu_profile" "$heap_profile" "$representative_analysis"
  representative_analysis_status=$?
  set -e
fi
if (( representative_analysis_status != 0 )); then
  status="$representative_analysis_status"
  if [[ ! -s "$representative_analysis" ]]; then
    printf 'Supplemental representative profile analysis failed with status %s.\n' "$representative_analysis_status" > "$representative_analysis"
  fi
fi

{
  printf '# Bun test profiling evidence\n\n'
  cat "$test_analysis"
  printf '\n'
  cat "$representative_analysis"
  printf '\n## Capture metadata\n\n'
  printf -- '- Test exit status: `%s`\n' "$test_status"
  printf -- '- Actual test profile analysis exit status: `%s`\n' "$actual_analysis_status"
  printf -- '- Actual test CPU sampling interval: `100 us`\n'
  printf -- '- Actual test heap capture: final `Bun.generateHeapSnapshot()` in `afterAll`.\n'
  printf -- '- Actual heap limitation: end-of-run live objects and self size, not cumulative allocation history or `alloc_space`/`alloc_objects`.\n'
  printf -- '- Representative workload exit status: `%s`\n' "$profile_status"
  printf -- '- Representative profile analysis exit status: `%s`\n' "$representative_analysis_status"
  printf -- '- Representative CPU sampling interval: `100 us`\n'
  printf -- '- Representative heap sampling interval: `4096 bytes`\n'
  printf -- '- Test workload: `bun test` with `scripts/test-profile-preload.ts`.\n'
  printf -- '- Supplemental workload: `scripts/profile-workload.ts` (4,053 books, 250 search rounds, OPDS and HTML rendering).\n'
  printf -- '- Generated files:\n'
  find "$evidence_dir" -maxdepth 3 -type f -printf '  - `%P` (%s bytes)\n' | sort
} > "$evidence_dir/analysis.md"

printf 'Profile evidence: %s\n' "$evidence_dir"
exit "$status"

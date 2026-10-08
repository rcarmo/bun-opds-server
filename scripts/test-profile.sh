#!/usr/bin/env bash
set -euo pipefail

project="bun-opds-server"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_dir/project-tmp.sh"
project_tmp_root="$(project_tmp_resolve "$project")"
project_tmp_init "$project_tmp_root"
run_root="$project_tmp_root/runs"

workspace_profile_root="/workspace/analysis/${project}/test-profiles"
if [[ -f /workspace/AGENTS.md ]]; then
  if [[ -n "${PROFILE_ROOT:-}" && "$PROFILE_ROOT" != "$workspace_profile_root" && "$PROFILE_ROOT" != "$project_tmp_root/build/profile-conclusions" ]]; then
    echo "PROFILE_ROOT must be $workspace_profile_root locally or project build/profile-conclusions for CI" >&2
    exit 1
  fi
  profile_root="${PROFILE_ROOT:-$workspace_profile_root}"
else
  : "${PROFILE_ROOT:?set PROFILE_ROOT to retained profiling conclusions on this external host}"
  case "$PROFILE_ROOT" in /*) ;; *) echo "PROFILE_ROOT must be absolute" >&2; exit 1;; esac
  if [[ "$PROFILE_ROOT" == "$workspace_profile_root" ]]; then
    echo "set PROFILE_ROOT explicitly for this external host; the Piclaw default is not a fallback" >&2
    exit 1
  fi
  profile_root="$PROFILE_ROOT"
fi
case "$profile_root" in
  "$project_tmp_root/build/profile-conclusions") ;;
  "$project_tmp_root"/*) echo "PROFILE_ROOT inside project scratch must be exactly build/profile-conclusions" >&2; exit 1;;
esac

run_id="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}}"
case "$run_id" in
  ''|*[!A-Za-z0-9._-]*)
    echo "RUN_ID must contain only letters, digits, dot, underscore, or dash" >&2
    exit 2
    ;;
esac

conclusion_dir="${profile_root}/${run_id}"
capture_parent="${run_root}/pre-release-profile"
capture_dir="${capture_parent}/${run_id}"
if [[ -e "$conclusion_dir" || -L "$conclusion_dir" ]]; then
  echo "refusing to overwrite existing profiling conclusion: $conclusion_dir" >&2
  exit 1
fi
if [[ -e "$capture_dir" || -L "$capture_dir" ]]; then
  echo "refusing to overwrite existing raw profiling capture: $capture_dir" >&2
  exit 1
fi
project_path_usable "$capture_dir" || {
  echo "raw profiling path is unsafe or unusable: $capture_dir" >&2
  exit 1
}

ensure_owned_dir() {
  local path="$1"
  if [[ -L "$path" ]]; then
    echo "refusing symlink path: $path" >&2
    exit 1
  fi
  if [[ -e "$path" ]]; then
    if [[ ! -d "$path" || ! -O "$path" ]]; then
      echo "path must be an owned directory: $path" >&2
      exit 1
    fi
  else
    mkdir "$path"
  fi
}

umask 077
if [[ -f /workspace/AGENTS.md ]]; then
  ensure_owned_dir "/workspace/analysis"
  ensure_owned_dir "/workspace/analysis/${project}"
else
  profile_parent="$(dirname "$profile_root")"
  if [[ ! -d "$profile_parent" || -L "$profile_parent" || ! -O "$profile_parent" ]]; then
    echo "PROFILE_ROOT parent must be an existing owned directory: $profile_parent" >&2
    exit 1
  fi
fi
ensure_owned_dir "$profile_root"
ensure_owned_dir "$conclusion_dir"
ensure_owned_dir "$capture_parent"
ensure_owned_dir "$capture_dir"

cleanup_raw_profiles() {
  case "$capture_dir" in
    "$run_root/pre-release-profile/"*) ;;
    *) echo "refusing unexpected profile cleanup path: $capture_dir" >&2; return 1 ;;
  esac
  rm -rf -- "$capture_dir"
  rmdir -- "$capture_parent" 2>/dev/null || true
}
trap cleanup_raw_profiles EXIT
trap 'exit 130' HUP INT TERM

test_profiles_dir="$capture_dir/test-processes"
ensure_owned_dir "$test_profiles_dir"

bun_version="$(bun --version)"
revision="$(git rev-parse HEAD)"
working_tree_dirty=false
if [[ -n "$(git status --porcelain)" ]]; then working_tree_dirty=true; fi
started_at="$(date -u +%FT%TZ)"

test_bun_options="--preload=$PWD/scripts/test-profile-preload.ts"
if [[ -n "${BUN_OPTIONS:-}" ]]; then test_bun_options="${BUN_OPTIONS} ${test_bun_options}"; fi

set +e
OPDS_TEST_PROFILE_DIR="$test_profiles_dir" \
OPDS_TEST_CPU_INTERVAL_US=100 \
BUN_OPTIONS="$test_bun_options" \
RUN_ID="$run_id" \
  ./scripts/with-project-tmp.sh test bun test 2>&1 | tee "$capture_dir/test.log"
test_status=${PIPESTATUS[0]}

RUN_ID="${run_id}-workload" ./scripts/with-project-tmp.sh profile-workload \
  bun \
    --cpu-prof \
    --cpu-prof-name=cpu.cpuprofile \
    --cpu-prof-dir="$capture_dir" \
    --cpu-prof-interval=100 \
    --heap-prof-md \
    --heap-prof-name=heap.md \
    --heap-prof-dir="$capture_dir" \
    --heap-prof-interval=4096 \
    scripts/profile-workload.ts 2>&1 | tee "$capture_dir/profile-workload.log"
profile_status=${PIPESTATUS[0]}
set -e

status="$test_status"
if (( profile_status != 0 )); then status="$profile_status"; fi

actual_cpu_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name cpu.json -size +0c | wc -l)"
actual_heap_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name heap.json -size +0c | wc -l)"
actual_command_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name command.json -size +0c | wc -l)"
actual_error_count="$(find "$test_profiles_dir" -mindepth 2 -maxdepth 2 -type f -name capture-error.txt -size +0c | wc -l)"
test_analysis="$capture_dir/test-analysis.md"
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

cpu_profile="$capture_dir/cpu.cpuprofile"
heap_profile="$capture_dir/heap.md"
representative_analysis="$capture_dir/representative-analysis.md"
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

conclusion="$conclusion_dir/analysis.md"
{
  printf '# Bun pre-release profiling conclusion\n\n'
  printf -- '- Project: `%s`\n' "$project"
  printf -- '- Revision: `%s`\n' "$revision"
  printf -- '- Started: `%s`\n' "$started_at"
  printf -- '- Bun: `%s`\n' "$bun_version"
  printf -- '- Working tree dirty: `%s`\n' "$working_tree_dirty"
  printf -- '- Actual test exit status: `%s`\n' "$test_status"
  printf -- '- Actual profile analysis exit status: `%s`\n' "$actual_analysis_status"
  printf -- '- Supplemental workload exit status: `%s`\n' "$profile_status"
  printf -- '- Supplemental analysis exit status: `%s`\n' "$representative_analysis_status"
  printf -- '- Raw profiles, heap snapshots, traces, and disposable logs: deleted immediately after this analysis.\n\n'
  cat "$test_analysis"
  printf '\n'
  cat "$representative_analysis"
  printf '\n## Interpretation limits\n\n'
  printf -- '- CPU milliseconds are interval-weighted stack samples, not measured wall or on-CPU duration.\n'
  printf -- '- The actual test heap is final live object/self-size state, not cumulative allocation history.\n'
  printf -- '- Bun 1.4.2 exposes neither `alloc_space` nor `alloc_objects` in this workflow.\n'
  printf -- '- The representative workload is supplemental; it does not replace profiling the real test process.\n'
} > "$conclusion"

cleanup_raw_profiles
trap - EXIT
printf 'Profiling conclusion: %s\n' "$conclusion"
exit "$status"

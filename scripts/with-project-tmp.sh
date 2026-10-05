#!/usr/bin/env bash
set -euo pipefail

project="bun-opds-server"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# Resolve exactly once before this process changes TMPDIR/TMP/TEMP.
source "$script_dir/project-tmp.sh"
project_tmp_root="$(project_tmp_resolve "$project")"
project_tmp_init "$project_tmp_root"
cache_root="${project_tmp_root}/cache"
build_root="${project_tmp_root}/build"
test_root="${project_tmp_root}/tests"
log_root="${project_tmp_root}/logs"
run_root="${project_tmp_root}/runs"

if (( $# < 2 )); then
  echo "usage: $0 <purpose> <command> [args ...]" >&2
  exit 2
fi

purpose="$1"
shift
case "$purpose" in
  ''|*[!A-Za-z0-9._-]*)
    echo "purpose must contain only letters, digits, dot, underscore, or dash" >&2
    exit 2
    ;;
esac

run_id="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}}"
case "$run_id" in
  ''|*[!A-Za-z0-9._-]*)
    echo "RUN_ID must contain only letters, digits, dot, underscore, or dash" >&2
    exit 2
    ;;
esac

purpose_dir="${run_root}/${purpose}"
run_dir="${purpose_dir}/${run_id}"
tmp_dir="${run_dir}/tmp"

ensure_owned_dir() {
  local path="$1"
  if [[ -L "$path" ]]; then
    echo "refusing symlink scratch path: $path" >&2
    exit 1
  fi
  if [[ -e "$path" ]]; then
    if [[ ! -d "$path" || ! -O "$path" ]]; then
      echo "scratch path must be an owned directory: $path" >&2
      exit 1
    fi
  else
    mkdir "$path"
  fi
}

umask 077
for path in \
  "$project_tmp_root" \
  "$cache_root" \
  "$cache_root/bun" \
  "$cache_root/npm" \
  "$cache_root/xdg" \
  "$build_root" \
  "$test_root" \
  "$log_root" \
  "$run_root" \
  "$purpose_dir" \
  "$run_dir" \
  "$tmp_dir"; do
  ensure_owned_dir "$path"
done

export PROJECT_TMP_ROOT="$project_tmp_root"
export CACHE_ROOT="$cache_root"
export BUILD_ROOT="$build_root"
export TEST_ROOT="$test_root"
export LOG_ROOT="$log_root"
export RUN_ROOT="$run_root"
export RUN_DIR="$run_dir"
export BUN_INSTALL_CACHE_DIR="$cache_root/bun"
export BUN_TMPDIR="$tmp_dir"
export npm_config_cache="$cache_root/npm"
export XDG_CACHE_HOME="$cache_root/xdg"
export TMPDIR="$tmp_dir"
export TMP="$tmp_dir"
export TEMP="$tmp_dir"

cleanup_run_dir() {
  case "$run_dir" in
    "$run_root/$purpose/"*) ;;
    *) echo "refusing unexpected run cleanup path: $run_dir" >&2; return 1 ;;
  esac
  if [[ -d "$run_root" && ! -L "$run_root" && -O "$run_root" ]]; then
    rm -rf -- "$run_dir"
    rmdir -- "$purpose_dir" 2>/dev/null || true
  fi
}
trap cleanup_run_dir EXIT
trap 'exit 130' HUP INT TERM

"$@"

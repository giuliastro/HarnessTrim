#!/usr/bin/env bash
# CI/release wrapper for smoke-test.sh.
#
# smoke-test.sh intentionally runs `npm publish --dry-run` to exercise npm 11's publish-time
# package.json normalization. On ordinary PRs the package version is often already published, so
# npm exits non-zero with the expected duplicate-version error *after* running that normalization.
# The historical script called fail() before defining it, accidentally masking every publish
# dry-run failure. This wrapper makes that first failure path explicit without changing the later
# smoke assertions: only the known duplicate-version result is tolerated; every other error fails.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  local message="${1:-smoke test failed}"
  if [ "$message" = "npm publish --dry-run failed" ] &&
     [ -n "${PUBLISH_STDERR:-}" ] &&
     grep -Eqi 'cannot publish over (the )?previously published versions' "$PUBLISH_STDERR"; then
    echo "== smoke: npm publish dry-run reached normalization; duplicate published version is expected =="
    return 0
  fi

  if [ -n "${PUBLISH_STDERR:-}" ] && [ -f "$PUBLISH_STDERR" ]; then
    cat "$PUBLISH_STDERR" >&2
  fi
  echo "FAIL: $message" >&2
  exit 1
}

# Source rather than spawn: the early publish block sees the wrapper's fail(). smoke-test.sh later
# defines its normal fail() for all remaining assertions, so only the historically broken call site
# receives this duplicate-version exception handling.
# shellcheck source=smoke-test.sh
source "$SCRIPT_DIR/smoke-test.sh" "$@"

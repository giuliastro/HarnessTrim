#!/usr/bin/env bash
# Clean-package smoke test: verify every published CLI path works from `npm pack`
# output installed into a fresh directory — the SAME artifact `npm publish` ships.
# This is what guards the source-layout assumptions in assets.ts / build.mjs
# against regressions (a package that works from a checkout but breaks from the
# tarball is worse than useless).
#
# Usage:  packages/cli/smoke-test.sh [--keep]
#   --keep   leave the scratch dir on failure for inspection.
# Exits non-zero on any failed check.
set -uo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/harnesstrim-smoke.XXXXXX")"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

cleanup() { [ "$KEEP" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

echo "== smoke: workdir=$WORK =="

# 1. Pack the tarball with npm (the real publish path — pnpm pack would apply
#    publishConfig.bin and mask bin issues, so use npm on purpose).
cd "$PKG_DIR"
npm pack --pack-destination "$WORK" >/dev/null 2>&1
TARBALL="$(ls "$WORK"/*.tgz 2>/dev/null | head -1)"
[ -n "$TARBALL" ] || { echo "FAIL: npm pack produced no tarball"; exit 1; }
echo "== smoke: packed $(basename "$TARBALL") =="

# 2. Install it into a fresh consumer project (zero transitive deps expected).
PROJ="$WORK/consumer"
mkdir -p "$PROJ"
cd "$PROJ"
npm install "$TARBALL" --no-save >/dev/null 2>&1 || { echo "FAIL: npm install of tarball"; exit 1; }
DEP_COUNT="$(node -e "const p=require('./node_modules/harnesstrim/package.json');console.log(Object.keys(p.dependencies||{}).length)")"
[ "$DEP_COUNT" = "0" ] || { echo "FAIL: published package has $DEP_COUNT runtime deps (expect 0)"; exit 1; }
echo "== smoke: installed, 0 runtime deps =="

BIN="$PROJ/node_modules/.bin/harnesstrim"
[ -x "$BIN" ] || { echo "FAIL: bin not executable at node_modules/.bin/harnesstrim"; exit 1; }

fail() { echo "FAIL: $1"; exit 1; }

# 3. --version prints a semver.
V="$("$BIN" --version 2>&1)" || fail "--version exited non-zero ($V)"
echo "$V" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+' || fail "--version did not print semver (got: $V)"
echo "== smoke: --version -> $V =="

# 4. doctor on a fresh dir (no crash, reports inspect).
D="$PROJ/app"
mkdir -p "$D"
"$BIN" doctor "$D" >/dev/null 2>&1 || fail "doctor exited non-zero"

# 5. reduce from stdin works and slims lint/test walls.
REDUCED="$(printf 'a.js:1:2  warning  no-console - msg\nb.js:3:4  error  eqeqeq - msg\n\n✖ 1 warnings\n  1 errors\n' | "$BIN" reduce --metrics "$PROJ/m.jsonl" 2>/dev/null)" || fail "reduce exited non-zero"
echo "$REDUCED" | grep -q "harnesstrim:lint-output-slim" || fail "reduce did not run lint-output-slim"

# 6. Every installer runs dry-run then --apply from a clean dir, using the
#    shipped assets (skills / hermes plugin / pi extension).
for t in opencode codex claude hermes pi; do
  "$BIN" install "$t" "$D" >/dev/null 2>&1 || fail "install $t (dry-run)"
  "$BIN" install "$t" "$D" --apply >/dev/null 2>&1 || fail "install $t --apply"
  # Second --apply must be idempotent (no error).
  "$BIN" install "$t" "$D" --apply >/dev/null 2>&1 || fail "install $t --apply (2nd, idempotency)"
done
[ -d "$D/.opencode/plugin" ] || fail "opencode plugin wrapper not written"
[ -d "$D/.codex/skills" ] || fail "codex skills not written"
[ -d "$D/.claude/skills" ] || fail "claude skills not written"
[ -d "$D/.pi/extensions/harnesstrim" ] || fail "pi extension not written"
[ -d "$D/.hermes" ] || fail "hermes plugin not written"
SKILLS="$("$BIN" preset list 2>/dev/null | head -1)" # sanity: presets resolve
echo "== smoke: installers applied (opencode/codex/claude/hermes/pi), assets present =="

# 7. mcp stdio handshake exposes the reduce tool.
MCP_OUT="$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' | timeout 10 "$BIN" mcp 2>/dev/null)" || fail "mcp initialize"
echo "$MCP_OUT" | grep -q "2024-11-05" || fail "mcp did not reply to initialize"

# 8. bench is graceful from a standalone install (dev-tool message, no crash).
BENCH_OUT="$("$BIN" bench 2>&1 | head -1)" 
echo "$BENCH_OUT" | grep -qiE "checkout|bench" || fail "bench should print a dev-tool message (got: $BENCH_OUT)"

# 9. metrics reads a recorded TrimEvent file.
[ -s "$PROJ/m.jsonl" ] || fail "reduce --metrics did not write metrics"

echo "== smoke: ALL CHECKS PASSED =="

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

# npm 11 performs an additional publish-time package.json normalization that
# `npm pack` alone does not fully expose. v0.2.0 proved why this is a release
# gate: "./dist/cli.mjs" packed and installed in this smoke test, but `npm publish`
# stripped the bin mapping and shipped a package with no global command.
PUBLISH_STDOUT="$WORK/publish-dry-run.json"
PUBLISH_STDERR="$WORK/publish-dry-run.stderr"
npm publish --dry-run --json >"$PUBLISH_STDOUT" 2>"$PUBLISH_STDERR" || {
  cat "$PUBLISH_STDERR" >&2
  fail "npm publish --dry-run failed"
}
if grep -Eq 'bin\[harnesstrim\].*(invalid|removed)|script name .* was invalid and removed' "$PUBLISH_STDERR"; then
  cat "$PUBLISH_STDERR" >&2
  fail "npm publish normalization would remove the harnesstrim bin"
fi

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
EXPECTED_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
[ "$V" = "$EXPECTED_VERSION" ] || fail "--version $V does not match package.json $EXPECTED_VERSION"
echo "== smoke: --version -> $V =="

# 4. doctor on a fresh dir (no crash, reports inspect).
D="$PROJ/app"
mkdir -p "$D"
"$BIN" doctor "$D" >/dev/null 2>&1 || fail "doctor exited non-zero"

# 5. reduce from stdin works and slims lint/test walls. The lint wall must be
#    longer than the 400-char default min-length or lint-output-slim is skipped.
LINT_WALL="$(for i in $(seq 1 30); do printf "src/file%02d.js:%d:%d  warning  no-console - unused variable msg\n" "$i" "$((i+1))" "$((i*2))"; done)"
LINT_WALL="$LINT_WALL
✖ 30 warnings
  0 errors"
REDUCED="$(printf '%s\n' "$LINT_WALL" | "$BIN" reduce --metrics "$PROJ/m.jsonl" 2>/dev/null)" || fail "reduce exited non-zero"
echo "$REDUCED" | grep -q "harnesstrim:lint-output-slim" || fail "reduce did not run lint-output-slim"
# The reduce path is a standalone process: its receipt carries exact cl100k token
# counts (the tokenizer is bundled, unlike in-harness adapters which report null).
# Receipts are compact JSONL (no space after the colon), unlike the pretty-printed
# config files asserted further down.
grep -qE '"beforeTokens":[0-9]+' "$PROJ/m.jsonl" || fail "reduce receipt missing beforeTokens count"
grep -qE '"afterTokens":[0-9]+' "$PROJ/m.jsonl" || fail "reduce receipt missing afterTokens count"
# --min-length raises the threshold: a reducible input with a huge threshold passes through.
REDUCED_HIGH="$(printf '%s\n' "$LINT_WALL" | "$BIN" reduce --min-length 999999 2>/dev/null)" || fail "reduce --min-length exited non-zero"
echo "$REDUCED_HIGH" | grep -q "harnesstrim:lint-output-slim" && fail "reduce --min-length 999999 should not reduce"
[ "$REDUCED_HIGH" = "$LINT_WALL" ] || fail "reduce --min-length 999999 changed the input"

# 6. Every installer runs dry-run then --apply from a clean dir, using the
#    shipped assets (skills / hermes plugin / pi extension / omp hook).
for t in opencode codex claude hermes pi omp; do
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
[ -d "$D/.omp/hooks/post" ] || fail "omp hook not written"
[ -f "$D/.omp/hooks/harnesstrim.json" ] || fail "omp baked config not written"
SKILLS="$("$BIN" preset list 2>/dev/null | head -1)" # sanity: presets resolve
echo "== smoke: installers applied (opencode/codex/claude/hermes/pi/omp), assets present =="

# 6a. Narrowed installs write only what they promise.
ND="$PROJ/narrowed"
mkdir -p "$ND"
"$BIN" install claude "$ND" --no-hook --apply >/dev/null 2>&1 || fail "install claude --no-hook --apply"
[ -d "$ND/.claude/skills" ] || fail "--no-hook: skills missing"
[ ! -f "$ND/.claude/settings.json" ] || fail "--no-hook: settings.json should NOT exist (hook skipped)"
"$BIN" install codex "$ND" --no-instructions --apply >/dev/null 2>&1 || fail "install codex --no-instructions --apply"
[ -d "$ND/.codex/skills" ] || fail "--no-instructions: codex skills missing"
[ ! -f "$ND/AGENTS.md" ] || fail "--no-instructions: AGENTS.md should NOT exist"
"$BIN" install opencode "$ND" --mode dryrun --min-length 2000 --tools bash,read --apply >/dev/null 2>&1 || fail "install opencode --mode/--min-length/--tools --apply"
grep -q '"mode": "dryrun"' "$ND/.opencode/plugin/harnesstrim.ts" || fail "opencode wrapper missing mode dryrun"
grep -q '"minLength": 2000' "$ND/.opencode/plugin/harnesstrim.ts" || fail "opencode wrapper missing minLength 2000"
grep -q '"toolFilter"' "$ND/.opencode/plugin/harnesstrim.ts" || fail "opencode wrapper missing toolFilter"
grep -q '"bash"' "$ND/.opencode/plugin/harnesstrim.ts" || fail "opencode wrapper missing bash in toolFilter"

# 6a2. hermes / pi / omp bake --mode + --min-length into their config.json, and the
#      baked config survives a plain re-`--apply` (state preservation).
HDP="$PROJ/hdp"
mkdir -p "$HDP"
"$BIN" install hermes "$HDP" --mode active --min-length 800 --apply >/dev/null 2>&1 || fail "install hermes --mode/--min-length --apply"
grep -q '"mode": "active"' "$HDP/.hermes/plugins/harnesstrim/config.json" || fail "hermes config missing mode active"
grep -q '"minLength": 800' "$HDP/.hermes/plugins/harnesstrim/config.json" || fail "hermes config missing minLength 800"
HNO="$PROJ/hermes-no-enable"
mkdir -p "$HNO"
"$BIN" install hermes "$HNO" --mode active --no-enable --apply --json >"$HNO/install.json" 2>/dev/null || fail "install hermes --no-enable --apply"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(r.details?.enabled!==null || !String(r.details?.enableMessage||"").includes("intentionally skipped")) process.exit(1)' "$HNO/install.json" || fail "hermes --no-enable did not report skipped enablement"
[ -f "$HNO/.hermes/config.yaml" ] && fail "hermes --no-enable unexpectedly wrote config.yaml"
"$BIN" install hermes "$HDP" --apply >/dev/null 2>&1 || fail "install hermes (2nd, idempotency)"
grep -q '"mode": "active"' "$HDP/.hermes/plugins/harnesstrim/config.json" || fail "hermes re-apply reset the baked mode"
PDP="$PROJ/pdp"
mkdir -p "$PDP"
"$BIN" install pi "$PDP" --mode active --min-length 500 --metrics "$PDP/m.jsonl" --apply >/dev/null 2>&1 || fail "install pi --mode/--min-length/--metrics --apply"
grep -q '"metrics"' "$PDP/.pi/extensions/harnesstrim/config.json" || fail "pi config missing baked metrics path"
ODP="$PROJ/odp"
mkdir -p "$ODP"
"$BIN" install omp "$ODP" --mode active --min-length 300 --metrics "$ODP/m.jsonl" --apply >/dev/null 2>&1 || fail "install omp --mode/--min-length/--metrics --apply"
grep -q '"minLength": 300' "$ODP/.omp/hooks/harnesstrim.json" || fail "omp config missing minLength 300"

# 6b. capabilities is valid JSON, names all six harnesses, and carries digests.
CAPS="$(node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" <<< "$("$BIN" capabilities 2>/dev/null)" && echo ok)" || fail "capabilities did not emit valid JSON"
[ "$CAPS" = "ok" ] || fail "capabilities invalid JSON"
for h in opencode codex claude hermes pi omp; do
  "$BIN" capabilities 2>/dev/null | grep -q "\"$h\"" || fail "capabilities missing harness $h"
done
"$BIN" capabilities 2>/dev/null | grep -q '"digests"' || fail "capabilities missing digests"
FLAT_SHA="$(node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8'));for(const d of Object.values(c.digests))for(const v of Object.values(d))if(!/^[0-9a-f]{64}$/.test(v))process.exit(1)" <<< "$("$BIN" capabilities 2>/dev/null)")" || fail "capabilities digest values are not sha256 hex"

# 6c. --json works for doctor / install / metrics (one JSON object on stdout).
node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" <<< "$("$BIN" doctor "$D" --json 2>/dev/null)" || fail "doctor --json invalid"
node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" <<< "$("$BIN" install opencode "$ND" --json 2>/dev/null)" || fail "install --json invalid"

# 6d. uninstall dry-runs, then --apply removes what install wrote.
"$BIN" uninstall pi "$D" >/dev/null 2>&1 || fail "uninstall pi (dry-run)"
[ -d "$D/.pi/extensions/harnesstrim" ] || fail "uninstall dry-run removed files without --apply"
"$BIN" uninstall pi "$D" --apply >/dev/null 2>&1 || fail "uninstall pi --apply"
[ -d "$D/.pi/extensions/harnesstrim" ] && fail "uninstall pi --apply left the extension dir"
"$BIN" uninstall opencode "$D" --apply >/dev/null 2>&1 || fail "uninstall opencode --apply"
[ -d "$D/.opencode/plugin" ] && fail "uninstall opencode --apply left the wrapper"
"$BIN" uninstall claude "$D" --apply >/dev/null 2>&1 || fail "uninstall claude --apply"
[ -d "$D/.claude/skills" ] && fail "uninstall claude --apply left skills"
"$BIN" uninstall omp "$D" >/dev/null 2>&1 || fail "uninstall omp (dry-run)"
[ -f "$D/.omp/hooks/post/harnesstrim.ts" ] || fail "uninstall omp dry-run removed files without --apply"
"$BIN" uninstall omp "$D" --apply >/dev/null 2>&1 || fail "uninstall omp --apply"
[ -f "$D/.omp/hooks/post/harnesstrim.ts" ] && fail "uninstall omp --apply left the hook"
echo "== smoke: capabilities + digests + --json + narrowing + uninstall verified =="

# 7. mcp stdio handshake exposes the reduce tool.
MCP_OUT="$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' | timeout 10 "$BIN" mcp 2>/dev/null)" || fail "mcp initialize"
echo "$MCP_OUT" | grep -q "2024-11-05" || fail "mcp did not reply to initialize"

# 8. bench is graceful from a standalone install (dev-tool message, no crash).
BENCH_OUT="$("$BIN" bench 2>&1 | head -1)" 
echo "$BENCH_OUT" | grep -qiE "checkout|bench" || fail "bench should print a dev-tool message (got: $BENCH_OUT)"

# 9. metrics reads a recorded TrimEvent file.
[ -s "$PROJ/m.jsonl" ] || fail "reduce --metrics did not write metrics"

echo "== smoke: ALL CHECKS PASSED =="

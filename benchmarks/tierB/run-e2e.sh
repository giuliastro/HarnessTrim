#!/usr/bin/env bash
# Tier B end-to-end benchmark: run the SAME task through OpenCode twice — once vanilla
# (--pure, HarnessTrim disabled) and once trimmed (adapter active) — and compare total
# token usage and whether the task still succeeded (quality retention).
#
# Requires a reachable, tool-calling model. Pass the OpenCode model id via MODEL, e.g.:
#   MODEL=GMKtec/qwen/qwen3-coder-next ./run-e2e.sh
#
# The token number is model-dependent and this runs each condition once, so treat a
# single run as anecdotal, not a statistical claim. The deterministic tool-output
# reduction for this task (no model needed) is ~58% — see README.md.
set -uo pipefail

MODEL="${MODEL:-}"
if [ -z "$MODEL" ]; then
  echo "Set MODEL to an OpenCode model id, e.g. MODEL=GMKtec/qwen/qwen3-coder-next $0" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DIR="$SCRIPT_DIR/task-failing-test"
OUT_DIR="$SCRIPT_DIR/reports"
mkdir -p "$OUT_DIR"

PROMPT='Run the test suite with `npm test`, then reply with ONLY the name of the failing test (nothing else).'
EXPECTED='handles concurrent writes without deadlock'

run_condition() {
  local label="$1"; shift
  local extra=("$@")
  local log="$OUT_DIR/run-$label.jsonl"
  echo "=== $label run (model=$MODEL) ==="
  ( cd "$TASK_DIR" && opencode run -m "$MODEL" --format json "${extra[@]}" "$PROMPT" ) >"$log" 2>"$OUT_DIR/run-$label.err" || true
  node "$SCRIPT_DIR/parse-usage.mjs" "$log" >"$OUT_DIR/usage-$label.json" || true
  local total
  total="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).totalTokens)}catch{console.log('null')}" "$OUT_DIR/usage-$label.json")"
  local ok="no"
  if grep -q "$EXPECTED" "$log"; then ok="yes"; fi
  echo "  total tokens: $total | task succeeded (named the failing test): $ok"
  echo "$label $total $ok"
}

echo "Task: $PROMPT"
echo "Expected failing test: $EXPECTED"
echo
V=$(run_condition "vanilla" --pure | tail -1)
T=$(run_condition "trimmed" | tail -1)

echo
echo "=== summary ==="
echo "condition  totalTokens  success"
echo "$V"
echo "$T"
echo
echo "Raw event logs + parsed usage are in $OUT_DIR/. Token counts are model-dependent and"
echo "single-run; the deterministic per-task reduction (~58% on tool output) is in README.md."

#!/usr/bin/env bash
# Tier B end-to-end benchmark: run the SAME task through OpenCode twice — once vanilla
# (--pure, HarnessTrim disabled) and once trimmed (adapter active) — and compare token
# usage and whether the task still succeeded (quality retention).
#
#   MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh
#
# Notes learned from live runs:
#  - `opencode run --format json` HANGS on agentic (tool-calling) runs when redirected,
#    so we run in streaming mode and read token counts from `opencode export <sessionID>`
#    (summed by sum-session-tokens.mjs) instead.
#  - This runs each condition once; treat a single run as anecdotal, not statistical.
#  - The deterministic per-task tool-output reduction (no model) is ~58%; see README.md.
set -uo pipefail

MODEL="${MODEL:-}"
if [ -z "$MODEL" ]; then
  echo "Set MODEL to an OpenCode model id, e.g. MODEL=opencode/deepseek-v4-flash-free $0" >&2
  exit 2
fi

OPENCODE="${OPENCODE:-opencode}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# TASK selects which fixture project to run (default: the original small task).
# e.g. TASK=task-large-suite MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh
TASK="${TASK:-task-failing-test}"
TASK_DIR="$SCRIPT_DIR/$TASK"
OUT_DIR="$SCRIPT_DIR/reports/$TASK"
mkdir -p "$OUT_DIR"

PROMPT='Run the test suite with `npm test`, then reply with ONLY the name of the failing test (nothing else).'
EXPECTED='handles concurrent writes without deadlock'

run_condition() {
  local label="$1"; shift
  echo "=== $label run (model=$MODEL) ===" >&2
  ( cd "$TASK_DIR" && timeout 300 "$OPENCODE" run -m "$MODEL" "$@" "$PROMPT" ) >"$OUT_DIR/run-$label.log" 2>&1 || true

  local ok="no"; grep -q "$EXPECTED" "$OUT_DIR/run-$label.log" && ok="yes"

  # Newest session = the run we just did.
  local sid; sid="$( ( cd "$TASK_DIR" && "$OPENCODE" session list 2>/dev/null ) | grep -oE '^ses_[A-Za-z0-9]+' | head -1)"
  local billed="?"
  if [ -n "$sid" ]; then
    ( cd "$TASK_DIR" && "$OPENCODE" export "$sid" 2>/dev/null ) >"$OUT_DIR/session-$label.json"
    node "$SCRIPT_DIR/sum-session-tokens.mjs" "$OUT_DIR/session-$label.json" >"$OUT_DIR/tokens-$label.json" 2>/dev/null || true
    billed="$(node -e "try{const t=require('fs').readFileSync(process.argv[1],'utf8');const j=JSON.parse(t);console.log(j.billedTokens+' (input '+j.input+', cacheRead '+j.cacheRead+')')}catch{console.log('?')}" "$OUT_DIR/tokens-$label.json")"
  fi
  echo "  success=$ok  billedTokens=$billed  session=$sid"
  echo "$label|$ok|$billed"
}

echo "Task: $PROMPT"
echo "Expected failing test: $EXPECTED"
echo
V="$(run_condition vanilla --pure | tail -1)"
T="$(run_condition trimmed | tail -1)"

echo
echo "=== summary (condition | success | billedTokens) ==="
echo "$V"
echo "$T"
echo
echo "Logs, session exports, and token sums are in $OUT_DIR/. Single-run and model-dependent;"
echo "see README.md for the reference live result and honest interpretation."

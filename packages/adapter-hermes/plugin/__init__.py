"""
HarnessTrim Hermes plugin — tool-output reduction via transform_tool_result hook.

When enabled, this plugin intercepts the ``transform_tool_result`` hook after every
tool call and slims noisy output (test runners, git diffs, build logs) to its signal
before the result enters the model's context.  Dry-run mode logs what *would* be
reduced; active mode rewrites the result; telemetry (off by default) records every
reduction as a TrimEvent JSON line.

Run the ``harnesstrim reduce`` command via a subprocess so the reducers live in the
shared TypeScript/Node core rather than being reimplemented in Python.

Hook contract
-------------
``transform_tool_result`` is a built-in Hermes plugin hook:
- ``hermes_cli/plugins.py`` — listed in ``VALID_HOOKS``
- ``model_tools.py:1313-1345`` — core loop fires it after every tool call;
  first callback to return a string replaces the result
- ``plugins/security-guidance/__init__.py`` — shipped plugin uses it
- ``tests/test_transform_tool_result_hook.py`` — dedicated test coverage

Callback receives: tool_name, args, result, task_id, session_id, tool_call_id,
turn_id, api_request_id, duration_ms, status, error_type, error_message.
Return a string to replace the result, or None to leave unchanged.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

PLUGIN_DIR = Path(__file__).parent

CONFIG_DEFAULTS = {
    "mode": "dryrun",       # "dryrun" | "active" | "off"
    "minLength": 400,
    "telemetry": False,
    "debug": False,
}

# Tool types whose output we consider for reduction.
REDUCER_TOOLS = frozenset({
    "terminal",
})


def register(ctx):
    """Register the HarnessTrim transform_tool_result hook."""
    ctx.register_hook("transform_tool_result", on_tool_result)


def _load_config():
    """Return the active plugin config from the environment (no global registry needed)."""
    cfg = dict(CONFIG_DEFAULTS)
    for key in CONFIG_DEFAULTS:
        env_key = f"HARNESSTRIM_{key.upper()}"
        val = os.environ.get(env_key)
        if val is not None:
            if isinstance(CONFIG_DEFAULTS[key], bool):
                cfg[key] = val.lower() in ("1", "true", "yes")
            elif isinstance(CONFIG_DEFAULTS[key], int):
                try:
                    cfg[key] = int(val)
                except ValueError:
                    pass
            else:
                cfg[key] = val
    return cfg


def _find_harnesstrim_cli() -> str | None:
    """Locate the ``harnesstrim`` CLI binary on PATH."""
    # Try PATH resolution
    for p in os.environ.get("PATH", "").split(os.pathsep):
        candidate = Path(p) / "harnesstrim"
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate.resolve())
    # Check common monorepo dev location via the repo-root sentinel
    return None


def _call_reducer(text: str, min_length: int) -> str:
    """Shell out to ``harnesstrim reduce`` and return the slimmed text.

    Falls back to the original text if the CLI cannot be found or the pipe fails.
    """
    cli = _find_harnesstrim_cli()
    if cli is None:
        # We are likely in a plugin context without the CLI on PATH.
        # Fall back to a bundler-aware path (the plugin ships alongside the monorepo?).
        # For now, silently pass through.
        return text

    if len(text) < min_length:
        return text

    try:
        result = subprocess.run(
            [cli, "reduce", "--min-length", str(min_length)],
            input=text,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout:
            return result.stdout.rstrip("\n")
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    return text


def on_tool_result(tool_name, args, result, **kwargs):
    """Hook handler: if the tool is in REDUCER_TOOLS, try to slim the result string.

    The contract of ``transform_tool_result`` is that the first handler that returns
    a string wins.  We return ``None`` (skip / no-op) unless we actually reduced.
    """
    cfg = _load_config()
    if cfg["mode"] == "off":
        return None
    if tool_name not in REDUCER_TOOLS:
        return None

    # The ``result`` argument is the raw JSON string returned by the tool handler.
    if not result or not isinstance(result, str):
        return None

    # Parse the JSON to extract the human-readable text portion.
    try:
        payload = json.loads(result)
    except (json.JSONDecodeError, ValueError):
        payload = None

    if isinstance(payload, dict):
        text = payload.get("output", "")
        if not isinstance(text, str) or not text:
            return None
    elif isinstance(payload, str):
        text = payload
    else:
        text = result

    before_len = len(text)
    if before_len < cfg["minLength"]:
        return None

    # Check for an already-reduced marker to avoid double-reduction.
    HERMES_TRIM_MARKERS = ("[harnesstrim", "[hermes-trim", "harnesstrim:test-output-slim")
    if any(marker in text for marker in HERMES_TRIM_MARKERS):
        return None

    after = _call_reducer(text, cfg["minLength"])

    if after == text:
        return None  # no change — let other handlers (if any) run

    if cfg["mode"] == "dryrun":
        saved = before_len - len(after)
        click = sys.stderr if sys.stderr else None
        if click:
            print(
                f"[harnesstrim] dryrun: {tool_name} "
                f"{before_len} -> {len(after)} chars (would save {saved})",
                file=click,
            )
        return None  # dryrun: don't mutate the result

    # active mode: rewrite the result
    if isinstance(payload, dict):
        payload["output"] = after
        # Preserve the original raw output for debugging
        if cfg["telemetry"]:
            payload.setdefault("metadata", {})["_harnesstrim_before"] = before_len
        return json.dumps(payload, ensure_ascii=False)
    else:
        return after

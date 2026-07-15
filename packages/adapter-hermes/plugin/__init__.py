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
from pathlib import Path

PLUGIN_DIR = Path(__file__).parent

CONFIG_DEFAULTS = {
    "mode": "dryrun",       # "dryrun" | "active" | "off"
    "minLength": 400,
    "telemetry": False,      # explicit opt-in: tool output may contain sensitive data
    "debug": False,
}

# Store telemetry in the active Hermes home. HERMES_HOME is profile-aware when set
# by Hermes; direct CLI usage falls back to the default profile.
METRICS_PATH = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))) / "harnesstrim-metrics.jsonl"

# Tool types whose output we consider for reduction.
REDUCER_TOOLS = frozenset({
    "terminal",
    "read_file",
    "web_extract",
    "search_files",
    "browser_snapshot",
    "vision_analyze",
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


def _call_reducer(text: str, min_length: int) -> tuple[str, str | None]:
    """Shell out to ``harnesstrim reduce`` and return (slimmed_text, reducer_name).

    Falls back to (original_text, None) if the CLI cannot be found or the pipe fails.
    The reducer name is parsed from the ``--stats`` stderr line (e.g. ``test-output-slim``),
    used only for telemetry when enabled.
    """
    cli = _find_harnesstrim_cli()
    if cli is None:
        import warnings
        warnings.warn(
            "[harnesstrim] CLI not found on PATH — output not reduced. "
            "Install CLI with: curl -fsSL https://harnesstrim.dev/install.sh | bash "
            "or build from source: git clone https://github.com/harnesstrim/harnesstrim",
            stacklevel=2,
        )
        return (text, None)

    if len(text) < min_length:
        return (text, None)

    try:
        result = subprocess.run(
            [cli, "reduce", "--min-length", str(min_length), "--stats"],
            input=text,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout:
            reducer = None
            # stderr: "[harnesstrim reduce] <reducer>: <before> -> <after> chars"
            for line in result.stderr.splitlines():
                line = line.strip()
                if line.startswith("[harnesstrim reduce]"):
                    rest = line[len("[harnesstrim reduce] "):]
                    if ":" in rest and "no reduction" not in rest:
                        reducer = rest.split(":")[0].strip()
            return (result.stdout.rstrip("\n"), reducer)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    return (text, None)


def _text_targets(payload):
    """Yield mutable payload mappings and text-field names safe to reduce.

    Hermes tools use different result schemas: terminal returns ``output``, file
    tools ``content``, browser snapshots ``snapshot``, vision ``analysis``, and
    web_extract has one content field per entry in ``results``.
    """
    if not isinstance(payload, dict):
        return []

    targets = []
    for key in ("output", "content", "snapshot", "analysis"):
        if isinstance(payload.get(key), str) and payload[key]:
            targets.append((payload, key))
            break

    results = payload.get("results")
    if isinstance(results, list):
        for entry in results:
            if not isinstance(entry, dict):
                continue
            for key in ("content", "output", "text"):
                if isinstance(entry.get(key), str) and entry[key]:
                    targets.append((entry, key))
                    break
    return targets


def on_tool_result(tool_name, args, result, **kwargs):
    """Reduce recognized textual fields while preserving the original JSON schema."""
    cfg = _load_config()
    if cfg["mode"] == "off" or tool_name not in REDUCER_TOOLS:
        return None
    if not result or not isinstance(result, str):
        return None

    try:
        payload = json.loads(result)
    except (json.JSONDecodeError, ValueError):
        payload = None

    if isinstance(payload, str):
        targets = [(None, None, payload)]
    elif payload is None:
        targets = [(None, None, result)]
    else:
        targets = [(container, key, container[key]) for container, key in _text_targets(payload)]

    if not targets:
        return None

    changed = False
    for container, key, text in targets:
        before_len = len(text)
        if before_len < cfg["minLength"]:
            continue
        if "[harnesstrim:" in text or "[hermes-trim" in text:
            continue

        after, reducer = _call_reducer(text, cfg["minLength"])
        if after == text:
            continue

        changed = True
        if cfg["mode"] == "dryrun":
            print(
                f"[harnesstrim] dryrun: {tool_name} "
                f"{before_len} -> {len(after)} chars (would save {before_len - len(after)})",
                file=sys.stderr,
            )
            continue

        if container is None:
            payload = after
        else:
            container[key] = after
        if cfg["telemetry"]:
            _write_metric(tool_name, reducer, before_len, len(after))

    if not changed or cfg["mode"] == "dryrun":
        return None
    return json.dumps(payload, ensure_ascii=False) if not isinstance(payload, str) else payload


def _write_metric(tool: str, reducer: str | None, before: int, after: int) -> None:
    """Append one TrimEvent JSONL line to METRICS_PATH (read by `harnesstrim metrics`).

    Only called in active mode when telemetry is explicitly enabled. Creates the parent
    directory lazily and swallows any error — telemetry must never crash the plugin.
    """
    import datetime as _dt

    event = {
        "ts": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "harness": "hermes",
        "tool": tool,
        "reducer": reducer,
        "beforeChars": before,
        "afterChars": after,
    }
    try:
        METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(METRICS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError:
        pass  # telemetry must never crash the plugin

# @harnesstrim/adapter-hermes

HarnessTrim adapter for [Hermes Agent](https://hermes-agent.nousresearch.com).

Hermes has a plugin system with a `transform_tool_result` hook that fires after every tool call and
before the result enters the model's context. This adapter **copies a Python plugin** into the Hermes
plugins directory. The plugin shells out to `harnesstrim reduce` to slim noisy tool output (test logs,
`git diff`, build output) before the model sees it.

Unlike the OpenCode/Claude adapters (which integrate via harness-native hooks), the Hermes adapter
works through Hermes' **plugin system** — no Hermes core patches needed.

## Install

```sh
harnesstrim install hermes                         # dry-run: user-level ~/.hermes target
harnesstrim install hermes --apply                  # copies/refreshes and enables the plugin
harnesstrim install hermes /path/to/project --apply # explicit project-local .hermes target
```

`--apply` invokes `hermes plugins enable harnesstrim` after copying when the Hermes CLI is available.
Restart Hermes after installation or refresh so the gateway loads the current plugin bundle.

## Mode lifecycle

| Env var | Default | Description |
|---------|---------|-------------|
| `HARNESSTRIM_MODE` | `dryrun` | `dryrun` = log reductions to stderr, don't touch output. `active` = actually reduce. `off` = disable. |
| `HARNESSTRIM_MINLENGTH` | `400` | Minimum output length before attempting reduction. |
| `HARNESSTRIM_TELEMETRY` | `false` | When on (and in `active` mode), append a `TrimEvent` JSONL line per reduction to `~/.hermes/harnesstrim-metrics.jsonl`. |
| `HARNESSTRIM_DEBUG` | `false` | Verbose logging. |

Start with `dryrun` (the default). Check stderr for `[harnesstrim]` lines to see what *would* be
reduced. When comfortable, set `HARNESSTRIM_MODE=active` in Hermes' environment.

Telemetry is **off by default**. With `HARNESSTRIM_TELEMETRY=1` and `active` mode, each reduction is
recorded; read the aggregate with `harnesstrim metrics ~/.hermes/harnesstrim-metrics.jsonl`.

## Architecture

```
Hermes tool call → transform_tool_result hook
  → __init__.py:on_tool_result()
    → extract output/content/snapshot/analysis/result content
    → if text ≥ minLength and no marker
      → subprocess: harnesstrim reduce --min-length X
      → mode == active: rewrite the same result field
      → mode == dryrun: log to stderr, don't touch
```

### Hook contract

The plugin uses Hermes' built-in [`transform_tool_result`](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks) hook,
which fires after every tool call and before the result enters the model's context.
If the callback returns a string, that string replaces the result the model sees.

This hook:
- Is listed in `VALID_HOOKS` in the Hermes source (`hermes_cli/plugins.py:135-139`).
- Is used by the shipped `security-guidance` plugin (`plugins/security-guidance/__init__.py:227-259`).
- Has dedicated test coverage (`tests/test_transform_tool_result_hook.py`).
- Runs after `post_tool_call` (observational) and before the result is appended to
  conversation context (`model_tools.py:1313-1345`).

## Safety properties

* **Dry-run by default** — no output is ever mutated until you opt in.
* **Markers** — skips if output contains `[harnesstrim`, `[hermes-trim`, or `harnesstrim:test-output-slim`
  to avoid double-reduction.
* **Minimum length** — outputs shorter than 400 chars are never touched.
* **Never grows output** — the reducer never returns more text than it received.
* **Only configured tools** — `terminal`, `read_file`, `web_extract`, `search_files`,
  `browser_snapshot`, and `vision_analyze`; their original JSON field names are preserved.
* **Profile-aware telemetry** — resolves `HERMES_HOME` when Hermes provides it, then falls back to
  the default profile home.

## Status

The install planner (`planHermesInstall`) is pure and unit-tested, and the Python plugin ships with
the package. The `transform_tool_result` hook contract is confirmed against the official Hermes docs
(hooks reference). **Verified in a live Hermes session** — the plugin loads, the hook fires on
`terminal` output, and reduction works end-to-end.

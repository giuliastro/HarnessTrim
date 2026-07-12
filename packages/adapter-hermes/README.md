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
harnesstrim install hermes                         # dry-run: shows what would be copied
harnesstrim install hermes --apply                  # writes the plugin to ~/.hermes/plugins/harnesstrim/
harnesstrim install hermes /path/to/project --apply  # project-local install (.hermes/plugins/)
```

After `--apply`, enable the plugin in `~/.hermes/config.yaml`:

```yaml
plugins:
  enabled:
    - harnesstrim
```

Then restart Hermes.

## Mode lifecycle

| Env var | Default | Description |
|---------|---------|-------------|
| `HARNESSTRIM_MODE` | `dryrun` | `dryrun` = log reductions to stderr, don't touch output. `active` = actually reduce. `off` = disable. |
| `HARNESSTRIM_MINLENGTH` | `400` | Minimum output length before attempting reduction. |
| `HARNESSTRIM_TELEMETRY` | `false` | Record metrics to the plugin's telemetry file. |
| `HARNESSTRIM_DEBUG` | `false` | Verbose logging. |

Start with `dryrun` (the default). Check stderr for `[harnesstrim]` lines to see what *would* be
reduced. When comfortable, set `HARNESSTRIM_MODE=active` in Hermes' environment.

## Architecture

```
Hermes tool call → tool executes → transform_tool_result hook
    → __init__.py:on_tool_result()
        → if tool == "terminal" && text ≥ minLength && no marker already present
            → subprocess: harnesstrim reduce --min-length X
            → if mode == "active": rewrite result.output
            → if mode == "dryrun":  log to stderr, don't touch
```

The reduction logic lives in the shared `@harnesstrim/core` package (TypeScript/Node), invoked via CLI
subprocess — no duplicate reducer logic in Python.

## Safety properties

* **Dry-run by default** — no output is ever mutated until you opt in.
* **Markers** — skips if output contains `[harnesstrim`, `[hermes-trim`, or `harnesstrim:test-output-slim`
  to avoid double-reduction.
* **Minimum length** — outputs shorter than 400 chars are never touched.
* **Never grows output** — the reducer never returns more text than it received.
* **Only `terminal` tool** — structured results from other tools are never touched.
* **Plugin system** — no Hermes core patches. Install/uninstall via `plugins.enabled` in config.

## Status

The install planner (`planHermesInstall`) is pure and unit-tested. The Python plugin ships with the
package. The Hermes plugin was *not* verified in a live Hermes session yet — the `transform_tool_result`
hook contract was assumed from the public plugin API. Run `harnesstrim install hermes --apply`, enable
the plugin, and check Hermes stderr for `[harnesstrim]` logs in dry-run mode to verify.

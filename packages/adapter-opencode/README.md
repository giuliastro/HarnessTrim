# @harnesstrim/adapter-opencode

HarnessTrim adapter for [OpenCode](https://opencode.ai). A thin plugin that:

- **`tool.execute.after`** — slims noisy tool output (test runs, git diffs, ...) in place using
  the shared `@harnesstrim/core` reducers, before it enters the model's context.
- **`experimental.session.compacting`** — injects `compact-handoff` guidance so compaction keeps
  decision-relevant state instead of narrated history.

The plugin is deliberately thin: all detection and reduction logic lives in `@harnesstrim/core`
(and is unit-tested there without a live harness). See the repo [PLAN.md](../../PLAN.md).

## Install (local / development)

From an OpenCode project, reference the plugin in `opencode.json`. During development you can point
at the workspace package directly:

```json
{
  "plugin": ["@harnesstrim/adapter-opencode"]
}
```

With options:

```json
{
  "plugin": [
    ["@harnesstrim/adapter-opencode", { "mode": "active", "minLength": 400, "debug": false }]
  ]
}
```

## Configuration

Options (in `opencode.json`) take precedence over environment variables, then defaults.

| Option              | Env var                   | Default    | Meaning                                                        |
| ------------------- | ------------------------- | ---------- | -------------------------------------------------------------- |
| `mode`              | `HARNESSTRIM_MODE`        | `active`   | `active` reduces in place; `dryrun` logs only; `off` disables. |
| `minLength`         | `HARNESSTRIM_MIN_LENGTH`  | `400`      | Tool outputs shorter than this (chars) are left untouched.     |
| `debug`             | `HARNESSTRIM_DEBUG`       | `false`    | Emit one-line `[harnesstrim]` diagnostics to stderr.           |
| `compactionHandoff` | —                         | `true`     | Inject handoff guidance on compaction.                         |
| `telemetry`         | `HARNESSTRIM_TELEMETRY`   | `false`    | Append a `TrimEvent` JSONL record per reduction.               |
| `telemetryPath`     | `HARNESSTRIM_TELEMETRY_PATH` | `.harnesstrim/metrics.jsonl` | Where telemetry JSONL is appended. |

Telemetry is **off by default**. When on, each reduction appends one JSON line; read the aggregate
with `harnesstrim metrics <path>`. In `dryrun` mode telemetry still records what *would* be reduced,
so you can size the win before switching to `active`.

Start with `mode: "dryrun"` and `debug: true` to see what *would* be reduced without changing
model input, then switch to `active` once you're comfortable.

## Runtime notes

- OpenCode plugins run on **Bun**; this package targets Bun's runtime (it imports TypeScript
  directly). No build step.
- Reduction is measured at runtime by character count (a cheap proxy) — no tokenizer is bundled
  into the harness process. Token-accurate reduction numbers live in the repo's `benchmarks/`.

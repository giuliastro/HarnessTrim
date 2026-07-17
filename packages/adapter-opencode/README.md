# @harnesstrim/adapter-opencode

HarnessTrim adapter for [OpenCode](https://opencode.ai). A thin plugin that:

- **`tool.execute.after`** — slims noisy tool output (test runs, git diffs, ...) in place using
  the shared `@harnesstrim/core` reducers, before it enters the model's context.
- **`experimental.session.compacting`** — injects `compact-handoff` guidance so compaction keeps
  decision-relevant state instead of narrated history.

The plugin is deliberately thin: all detection and reduction logic lives in `@harnesstrim/core`
(and is unit-tested there without a live harness). See the repo [PLAN.md](../../PLAN.md).

## Install

The easiest way is the CLI, which sets up the local-plugin wrapper below for you:

```sh
harnesstrim install opencode /path/to/project --apply
```

### How OpenCode loads it (important)

OpenCode's `opencode.json` `plugin` field is a **plain array of strings** (package names or file
paths) and **does not pass options to plugins** — the plugin function only receives OpenCode's
context. So a `["name", { …options }]` tuple in `opencode.json` is **not** valid and silently never
loads. There are two correct ways to run this adapter:

1. **Local plugin wrapper (recommended — gives you options).** A file auto-loaded from
   `.opencode/plugin/` that imports the adapter and calls it with options. This is what
   `harnesstrim install opencode` generates:

   ```ts
   // .opencode/plugin/harnesstrim.ts
   import { HarnessTrim } from "@harnesstrim/adapter-opencode";
   export const HarnessTrimPlugin = async (input) =>
     HarnessTrim(input, { mode: "active", telemetry: true, telemetryPath: ".harnesstrim/metrics.jsonl" });
   ```

   with the dependency declared in `.opencode/package.json`:

   ```json
   { "dependencies": { "@harnesstrim/adapter-opencode": "^0.0.2" } }
   ```

2. **Bare string + environment variables (no options in config).** List it as a string and drive
   config through `HARNESSTRIM_*` env vars:

   ```json
   { "plugin": ["@harnesstrim/adapter-opencode"] }
   ```

   This loads and reduces (mode `active` by default), but to get telemetry you must set
   `HARNESSTRIM_TELEMETRY=1` in OpenCode's environment.

## Configuration

Options passed to the wrapper's second argument take precedence over environment variables, then
defaults. (There is no way to pass options through `opencode.json` — see above.)

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

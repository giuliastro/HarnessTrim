# OpenCode example

Minimal setup wiring the HarnessTrim adapter as a **local plugin** in **dry-run** mode with debug
logging — the recommended way to try it first. It logs `[harnesstrim] dryrun ...` lines showing what
*would* be reduced, without changing what the model sees.

OpenCode's `opencode.json` `plugin` field is a plain string array and can't pass options to a
plugin, so the adapter is loaded as a local plugin file that calls it with options:

- [`opencode.json`](opencode.json) — just the schema; the plugin is auto-loaded from `.opencode/`.
- [`.opencode/plugin/harnesstrim.ts`](.opencode/plugin/harnesstrim.ts) — the wrapper (dry-run + debug).
- [`.opencode/package.json`](.opencode/package.json) — declares `@harnesstrim/adapter-opencode`.

Run `npm install` inside `.opencode/` (or `harnesstrim install opencode --apply`, which generates all
of this and installs the dependency for you). Then, once you've confirmed it's picking up the right
output, change `mode: "dryrun"` to `mode: "active"` and add `telemetry: true` in the wrapper to slim
output and record metrics.

See [`packages/adapter-opencode/README.md`](../../packages/adapter-opencode/README.md) for the full
option reference.

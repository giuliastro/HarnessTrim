# @harnesstrim/mcp

A stdio [MCP](https://modelcontextprotocol.io) server exposing HarnessTrim's reducer as a first-class
tool, for any MCP-capable harness (Codex, Claude Code, …). It's the deterministic, native alternative
to the shell pipe / AGENTS.md instruction.

## The `reduce` tool

| | |
| --- | --- |
| **name** | `reduce` |
| **input** | `text` (string), `minLength?` (number, default 400) |
| **output** | the slimmed text |

It applies the shared core reducers: keeps failures, errors, assertions and summaries; drops
passing-test noise and generated-file (lockfile/dist) diffs. Deterministic and idempotent, and it
never returns text larger than the input.

## Run

```sh
harnesstrim mcp                                    # starts the server on stdio
harnesstrim mcp --metrics .harnesstrim/metrics.jsonl  # + record a TrimEvent per reduction
```

`--metrics <path>` (or the `HARNESSTRIM_TELEMETRY_PATH` env var) appends one `TrimEvent` per
reduction, readable with `harnesstrim metrics <path>` — the same telemetry the OpenCode adapter emits.

## Register in a harness

Codex:

```sh
codex mcp add harnesstrim -- harnesstrim mcp
```

Claude Code (`claude mcp add-json`, user scope — records metrics globally):

```sh
claude mcp add-json harnesstrim-reduce \
  '{"command":"harnesstrim","args":["mcp","--metrics","~/.harnesstrim/metrics.jsonl"]}' --scope user
```

Or in `.mcp.json`:

```json
{ "mcpServers": { "harnesstrim": { "type": "stdio", "command": "harnesstrim", "args": ["mcp"] } } }
```

(If `harnesstrim` isn't on PATH yet, use `node /abs/path/to/packages/cli/src/cli.ts mcp` as the
command instead. Reload the harness after registering so it picks up the new server.)

## When to use the MCP tool vs the shell pipe

- **MCP `reduce` tool** — a native, discoverable tool the agent calls with text it already has (e.g.
  a captured log it's about to reason over or quote back). No AGENTS.md edit needed; registered once,
  works across projects.
- **`harnesstrim reduce` shell pipe** — reduces command output *before* it enters context
  (`pytest 2>&1 | harnesstrim reduce`), so it's the better token-saver for noisy commands. On
  OpenCode the `tool.execute.after` hook does this automatically.

## Status

Verified end-to-end: unit tests, an in-memory MCP client↔server round-trip, and a real stdio
handshake (`initialize` + `tools/list`) exercised via the exact `node … mcp` command Codex launches —
the `reduce` tool is discovered and callable.

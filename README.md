# HarnessTrim

> One token policy for Claude Code, Codex, OpenCode and Pi.

HarnessTrim is a cross-harness control plane for coding agents: a portable skill pack, thin
per-harness adapters, and a reproducible benchmark suite that together cut input tokens, output
tokens, and noisy tool output — instead of optimizing just one of those layers the way existing
tools do.

Full design rationale and phased roadmap: see [PLAN.md](PLAN.md).

## Status

Early scaffold. Current MVP target: **OpenCode** (see `PLAN.md` §5 for why).

## Layout

```
packages/core/              deterministic, idempotent reducers + content-based dispatcher
packages/adapter-opencode/  OpenCode plugin: slims tool output + injects compaction handoff
packages/cli/               harnesstrim CLI: doctor, install opencode, bench
skills/                     portable Agent Skills (delta-response, debug-log-slim,
                            review-delta, compact-handoff, scaffold-fast, delegate-bulk)
benchmarks/                 Tier A micro-benchmarks: reducer token-reduction, no LLM involved
examples/opencode/          minimal opencode.json wiring the adapter (dry-run)
```

## CLI

```sh
pnpm exec harnesstrim doctor [dir]            # diagnose token-waste signals in a project
pnpm exec harnesstrim install opencode [dir]  # wire the adapter into opencode.json (dry-run)
pnpm exec harnesstrim install opencode --apply
pnpm exec harnesstrim install opencode --preset lean-debug --apply
pnpm exec harnesstrim preset list             # list policy presets
pnpm exec harnesstrim preset show lean-review
pnpm exec harnesstrim metrics [path]          # summarize adapter telemetry (JSONL)
pnpm exec harnesstrim bench                    # run the Tier A reducer micro-benchmark
```

- `doctor` flags oversized always-loaded instruction files (CLAUDE.md/AGENTS.md/...), reports
  whether on-demand skills are used, and whether the OpenCode adapter is wired in.
- `install` is dry-run until `--apply`; `--preset` bakes a policy preset's adapter config in.
- `metrics` aggregates the telemetry the adapter emits (off by default) into chars saved per reducer.

## Try it

```sh
pnpm install
pnpm run test        # unit tests (core reducers + dispatcher + adapter hooks)
pnpm run typecheck   # type-check every package against real dependency types
pnpm run bench       # Tier A micro-benchmark: token reduction on fixed fixtures
```

## Use it in OpenCode

See [`packages/adapter-opencode`](packages/adapter-opencode/README.md) and
[`examples/opencode`](examples/opencode/). Start in `dryrun` mode, then switch to `active`.

## License

MIT — see [LICENSE](LICENSE).

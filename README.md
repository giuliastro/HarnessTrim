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
skills/                     portable Agent Skills (delta-response, debug-log-slim,
                            review-delta, compact-handoff)
benchmarks/                 Tier A micro-benchmarks: reducer token-reduction, no LLM involved
examples/opencode/          minimal opencode.json wiring the adapter (dry-run)
```

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

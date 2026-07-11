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
packages/core/       deterministic, idempotent reducers + policy primitives
skills/               portable Agent Skills (delta-response, debug-log-slim, review-delta)
benchmarks/           Tier A micro-benchmarks: reducer token-reduction, no LLM involved
```

## Try it

```sh
pnpm install
pnpm run test    # unit tests for packages/core reducers
pnpm run bench   # Tier A micro-benchmark: token reduction on fixed fixtures
```

## License

MIT — see [LICENSE](LICENSE).

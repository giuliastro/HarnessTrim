# AGENTS.md — HarnessTrim

Repo-specific operational notes. Loaded at the start of every session. Read this before
making changes.

## Working model

- Monorepo: `packages/` (core, adapters: opencode/claude/codex/hermes/pi, cli, mcp) + `benchmarks/` + `skills/`.
- Root package `harnesstrim-monorepo`, CLI package published as `harnesstrim` on npm.
- `pnpm` workspace + Node 24 (native TS via `node --experimental-strip-types`).
- Toolchain constraint: relative imports in `.ts` files MUST use the literal `.ts` extension
  (Node 24 does not remap `.js` → `.ts`).

## Commands

The repo uses pnpm, but `pnpm` and `opencode` are NOT always on the session PATH. Use the
full paths:


- Typecheck: `npm run typecheck`
- Test: `npm test`
- Core reducer tests only: `node --test "src/**/*.test.ts"` (from `packages/core`)
- Tier A benchmark (fails if signal fidelity drops): `npm run bench` or
  `node --experimental-strip-types benchmarks/src/run.ts`
- CLI build (esbuild bundle + staged assets): `node packages/cli/build.mjs`

## Git / remotes


## Benchmarks / token accounting

- Tier B (`benchmarks/tierB/`): vanilla vs trimmed OpenCode runs. `sum-session-tokens.mjs`
  counts each `messages[i].info.tokens` EXACTLY once — the session-level `info.tokens` is
  the aggregate and must NOT be summed on top (double-counting bug fixed 2026-07-17).
- Export shape changed 1.17→1.18: `input` is fresh-only, `cache.read` separate. Verify
  accounting assumptions if OpenCode bumps the format again.
- OpenCode model for Tier B: `opencode/deepseek-v4-flash-free`.

## Published state (as of last work)

- `harnesstrim` published: latest 0.0.5. 0.0.6 (lint-output-slim reducer, install/readStdin
  hang fixes, clean-package smoke test) is in PR.
- CLI features already present: `doctor`, `install opencode|codex|claude|hermes|pi`,
  `hook claude`, `reduce`, `mcp`, `bench`, `preset list/show`, `metrics`, `--version`.
- All five harness adapters exist (opencode/claude/codex/hermes/pi hooks; codex via
  instruction + MCP).
- CI: `.github/workflows/ci.yml` (typecheck/test/bench on 3 OS + hermes plugin tests).
  No release/publish job yet — planned.

# Task: install-precision, scriptable output, and safe uninstall for HarnessTrim

You are working in the HarnessTrim monorepo (giuliastro/HarnessTrim). Read AGENTS.md
and PLAN.md first — they are the source of truth for conventions (pnpm workspace,
Node 24 native TS with literal `.ts` import specifiers, dry-run-by-default installers,
telemetry off by default, deterministic/idempotent/cache-aware reducers, zero runtime
deps in the published `harnesstrim` CLI bundle).

## Background (why)

The installer is dry-run by default and idempotent, which is a good foundation. But a
few gaps make the CLI hard to use precisely and safely — both interactively and from
scripts:

- The installer produces only one fixed shape per harness: skills + hook + CLAUDE.md
  guidance on Claude, skills + AGENTS.md guidance on Codex, and a `mode: "active"`
  baked into a generated wrapper on OpenCode. There is no way to ask for a *narrower*
  install (skills only, or `dryrun` mode), so installs are more invasive than they need
  to be and cannot be composed with other tools.
- `doctor` and `metrics` render prose only, so their results cannot be consumed by
  scripts or other tools without parsing.
- Nothing states, in a machine-readable way, what this version supports per harness —
  discovery is manual and version-checking is impossible.
- There is no `uninstall`: removing an install means editing several files by hand.
- The telemetry stream has no schema version and no stable event ID, so it cannot be
  versioned, deduplicated, or evolved safely.

This is general product quality for HarnessTrim itself, not a feature request from a
specific downstream tool. Design and name each item as a normal HarnessTrim feature,
self-contained and useful from this CLI on its own. (A downstream tool happens to
consume this CLI too; that must never require a HarnessTrim-specific concept — keep
everything generic.)

Implement the items below, in this priority order.

## 1. Per-surface narrowing (highest priority)

The installer must be able to produce each narrower state its adapters can represent:

- **`install claude`** (`packages/adapter-claude/src/install.ts`): skills + Bash hook +
  CLAUDE.md instruction install as one unit (`HOOK_MATCHER = "Bash"`, line 6). Add a
  flag to install skills without the hook (e.g. `--no-hook`) and one to skip the
  marker-guarded `REDUCE_INSTRUCTION_SNIPPET` (lines 18–29). `planClaudeInstall` must
  stay pure — thread the options through its input and surface the resulting actions.
- **`install codex`** (`packages/adapter-codex/src/index.ts`): `planCodexInstall` always
  writes `REDUCE_INSTRUCTION_SNIPPET` into AGENTS.md (lines 23–34). Add a flag (e.g.
  `--no-instructions`) to produce skills-only.
- **`install opencode`** (`packages/cli/src/install.ts`): `DEFAULT_OPENCODE_ADAPTER_CONFIG`
  (lines 15–19) and every preset force `mode: "active"`, baked into the generated wrapper.
  Expose `--mode active|dryrun|off` and `--min-length <n>` as CLI flags;
  `runInstallOpencode` already accepts an `adapterConfig` override (line 124) — thread the
  flags through `cli.ts`.
- **Ideal, if cheap:** a per-surface selector confining reduction to a subset of tool
  families on OpenCode (use `input.tool` as a filter in `tool.execute.after`, currently
  ignored at `packages/adapter-opencode/src/plugin.ts:37`). This lets users install the
  adapter for only the surfaces they want.

Acceptance per harness: a documented CLI invocation produces the narrowed state; a unit
test asserts `plan*Install` returns `changed: false` on re-run for that state and `apply`
writes only the intended files.

## 2. Machine-readable output (`--json`)

Add a global `--json` flag to `doctor` (`packages/cli/src/doctor.ts`) and `metrics`
(`packages/cli/src/metrics.ts`), and ideally to `install <harness>` (emit the computed
plan as JSON: actions, target paths, whether anything changes) instead of the rendered
prose. One JSON object on stdout; human rendering stays the default. The CLI's own
results must be consumable by scripts and other tools without parsing prose.

## 3. New `capabilities` command

Add `harnesstrim capabilities` (JSON): per supported harness, the reduction surface(s) it
implements, the narrowed states the installer can produce (and via which flags), and the
reviewed write set (files/directories `install <harness>` writes or modifies). This makes
what this version supports discoverable and version-checkable by scripts, CI, and any
consumer, and removes the need to hardcode a per-version capability table anywhere.
Keep the data in one source in the repo; the command serializes it.

## 4. New `uninstall` command

Add `harnesstrim uninstall <harness>` that removes only what the installer wrote, using
the existing marker fences (`harnesstrim:begin`/`harnesstrim:end` in instruction files;
`hasHarnessTrimHook`/hook removal for `.claude/settings.json` and `.codex/hooks.json`;
the wrapper + `.opencode/package.json` dependency for OpenCode; the `.installed` marker
for Hermes). Dry-run by default, `--apply` to write. Never touch files it did not create
or marker-guarded regions.

## 5. Telemetry stream hardening

`TrimEvent` (`packages/core/src/metrics/trim-event.ts`) carries ts/harness/tool/reducer/
beforeChars/afterChars. Add: `schemaVersion` (start at 1; keep `parseTrimEvents` accepting
legacy lines), a stable event ID (so readers dedupe without synthesizing one), and token
counts only where the emitting path has them (`null` otherwise — do not bundle a
tokenizer into the harness process). Update the JSONL examples in README/docs.

## Constraints

- Installers stay **dry-run by default**; nothing written without `--apply`.
- **Telemetry stays opt-in**; never change defaults that would enable it.
- Do not change core reducer semantics; keep them deterministic, idempotent, cache-aware.
- Keep the published CLI **zero runtime dependencies** (esbuild bundle,
  `packages/cli/build.mjs`): `--json`/`capabilities` must not pull in a JSON library.
- New flags keep backward compatibility (existing invocations unchanged).
- Relative imports use the literal `.ts` extension. Run `npm run typecheck` and `npm test`;
  keep the whole suite green.

## Deliverables

- Code + unit tests per item, following the repo's `node --test` style (`.test.ts` beside
  source).
- Update the `HELP` text (`packages/cli/src/cli.ts`), README, and append a dated entry to
  PLAN.md's status log describing what changed and why.
- Do not commit or push. Report back: what was implemented, test/typecheck status, and
  anything harder or different than planned.

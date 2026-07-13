# HarnessTrim — Development Plan

> One token policy for Claude Code, Codex, OpenCode and Pi.

This file is the single source of truth for the project's design and roadmap. It is written to be
portable across coding harnesses (Claude Code, Codex, OpenCode, Pi) — whichever harness picks up
this repo next should start by reading this file in full.

Source proposal: `Proposta di repository open source per ridurre i token nei coding harness.docx`
(kept as background research; this file supersedes it for day-to-day development decisions).

---

## 1. Strategic thesis

The valuable thing to build is **not** another isolated tool like Caveman (output style compression)
or RTK (shell tool-output compression). It's a **cross-harness control plane**: a single system that
standardizes output style, tool-output compression, on-demand skills, thinking/effort routing,
noisy-task isolation, and consumption metrics — across harnesses that already expose nearly the same
leverage points under different APIs.

One-line description: *a stack that teaches coding harnesses to talk less, read less, think the right
amount, and delegate better.*

Existing tools each optimize one layer:
- **Caveman** — final output verbosity only. Leaves input/read/log/thinking tokens untouched. Numbers are self-reported.
- **RTK** — shell tool output (git diff, test runners, grep, build logs). Doesn't touch harness built-in tools (Read/Grep/Glob in Claude Code don't pass through the Bash hook). Numbers are self-reported.
- **Headroom** — general compression middleware (tool output, logs, RAG chunks, files, conversation history). Closer to generic middleware than to a coding-harness-native workflow.

HarnessTrim's differentiation: **skill-first, adapter-second**, plus a **reproducible benchmark
suite** (the thing every competitor lacks).

## 2. Corrections/additions to the original proposal

These are deviations from the source docx, decided after review — apply them, don't re-litigate:

1. **Skill portability is overstated.** The `SKILL.md` *format* is shared, but *activation*
   (frontmatter, directory conventions, discovery mechanism) differs per harness. The real cost
   center is the adapter layer, not skill authoring. Budget accordingly.

2. **Prompt caching is a first-class design constraint, missing from the original doc.** Any reducer
   that rewrites content sitting in the *stable prefix* of a conversation invalidates the prompt
   cache and can *increase* cost. Rule: reducers must be **cache-aware** — only touch volatile,
   non-cacheable content (tool output, logs), never the stable system/instruction prefix. Reducers
   must also be **deterministic and idempotent** (same input → byte-identical output), both for cache
   stability and for benchmarking.

3. **The "Read/Grep/Glob don't pass through the Bash hook" limitation (Claude Code specific) is not a
   footnote — it's a core gap to close.** Solution: expose reducers as **MCP tools**
   (`read_slim`, `grep_slim`, `test_slim`) that skills instruct the model to prefer. This is portable
   across harnesses and covers exactly what RTK-style shell hooks miss. For the OpenCode MVP this is
   less urgent since `tool.execute.before` intercepts *all* tool calls including built-ins — but keep
   the MCP-reducer design in mind for the later Claude Code adapter.

4. **End-to-end LLM-in-the-loop benchmarking is harder than it looks** (costs money, non-deterministic
   quality/token variance). Split benchmarking into two tiers:
   - **Tier A — micro-benchmarks (no LLM):** deterministic reducers run against fixed fixtures,
     measured with a real tokenizer (not `chars/4`). Cheap, reproducible, ships from day one.
   - **Tier B — end-to-end (LLM-in-the-loop):** aspirational, quality-scored, comparative
     (vanilla harness vs. harness+skills vs. harness+filters vs. full stack). Not a blocker for v0.

## 3. Architecture — three layers

```
Layer 1: Portable Skill Pack     — Agent Skills format, harness-agnostic policy/procedures
Layer 2: Adapter Layer           — thin per-harness translation of core policy into native hooks
Layer 3: CLI / Observability     — install, presets, metrics normalization, doctor
```

### Layer 1 — Skill Pack (core, portable)
Skills to ship, kept short with external references, not long inline prose:
- `delta-response` — terse, structured responses, no "caveman" gimmicks
- `debug-log-slim` — filter logs/test output to signal only (FAIL|ERROR patterns etc.)
- `review-delta` — problem-oriented code review, not summary-oriented
- `scaffold-fast` — low-effort boilerplate/mechanical transforms
- `compact-handoff` — what to preserve across context compaction
- `delegate-bulk` — when to push volume work to a subagent or another harness

MVP ships the first three; the rest follow once the adapter proves out.

### Layer 2 — Adapter Layer (per harness)
Each adapter is thin: it receives a policy object from the core and translates it into the harness's
native dialect. **First target: OpenCode** (see §5 for why and the exact API).

Planned adapters, in order:
1. **OpenCode** — plugin with `tool.execute.before` / `tool.execute.after`, and
   `experimental.session.compacting` for compaction handoff.
2. **Claude Code** — hooks (`PreToolUse`, `PreCompact`, `PostCompact`), skill bundle, effort profiles,
   MCP reducer tools (see correction #3 above).
3. **Codex** — skill bundle + plugin lifecycle hooks, possibly MCP exposure.
4. **Pi** — TypeScript extension, RPC mode, session parser.

### Layer 3 — CLI / Observability
Not a new agent. Does three things well:
- **Install** adapters and skills into a target harness config
- **Apply policy presets**: `lean-debug`, `lean-review`, `lean-scaffold`, `deep-architecture` — each
  defines output style, tool-filtering rules, recommended reasoning effort, subtask-isolation policy,
  compact/handoff instructions, and which metrics sources to read.
- **Collect metrics** — normalize per-harness telemetry (Claude `/usage`, OpenCode/Codex token
  counters, Pi session JSONL, RTK `gain`) into one `TrimEvent` schema.

Entry-point command that gives value before any policy is installed: **`harnesstrim doctor`** —
inspects an existing harness config and reports waste (giant always-loaded instructions file, verbose
hooks, unused skills).

## 4. Security model

- Adapters are **dry-run by default**; explicit install required.
- Telemetry **off by default**.
- Clear split between the declarative, safe core and the *active* adapters (which run shell
  commands / mutate tool calls).
- Document a trust policy for skills/plugins, since all four harnesses warn that
  skills/plugins/hooks can instruct arbitrary actions or include executable code.

## 5. Why OpenCode is the MVP target (not Claude Code)

Decision made 2026-07-11: start the vertical MVP on **OpenCode**, not Claude Code as originally
drafted. Rationale: OpenCode's plugin hook (`tool.execute.before`) intercepts **all** tool calls
uniformly — no built-in-tool carve-out to work around (unlike Claude Code's Bash-only hook gap) — so
the adapter is both simpler to build and structurally closer to what the core policy needs to prove
out first. Claude Code adapter comes second once the reducer/policy core is validated.

### OpenCode plugin API (confirmed via docs, 2026-07-11)

Plugin module shape:
```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // hook implementations
  }
}
```
Context object fields: `project` (current project info), `client` (OpenCode SDK client),
`$` (Bun shell API), `directory` (cwd), `worktree` (git worktree path).

TypeScript types: `import type { Plugin } from "@opencode-ai/plugin"`.

Hook: `tool.execute.before`
```javascript
"tool.execute.before": async (input, output) => {
  // input.tool: tool name
  // output.args: tool arguments (mutable) — this is where we rewrite/slim args
}
```

Hook: `tool.execute.after` — exists, exact shape to confirm when implementing (docs didn't give full
signature at time of writing; check `@opencode-ai/plugin` types in `node_modules` once installed).

Compaction hook: `experimental.session.compacting`
```javascript
"experimental.session.compacting": async (input, output) => {
  // output.context: array to inject additional context
  // output.prompt: can replace the entire compaction prompt
}
```
Fires before the LLM generates a continuation summary — this is the hook for the
`compact-handoff` skill's logic to plug into natively.

Custom tools (for exposing reducers as first-class tools, same pattern as the MCP-reducer idea in §2):
```javascript
import { tool } from "@opencode-ai/plugin"

tool({
  description: "...",
  args: { /* Zod schema fields */ },
  async execute(args, context) { /* returns result */ }
})
```

Runtime implication: OpenCode plugins run on **Bun**, not plain Node — the adapter package should
target Bun's shell API (`$`) rather than shelling out via `child_process`.

## 6. Repository layout

```
harnesstrim/
  README.md
  PLAN.md                       <- this file
  LICENSE
  docs/
    architecture.md
    benchmark-methodology.md
    security-model.md
    adapter-guides/
  packages/
    core/
      policy/
      reducers/
      effort-router/
      compaction/
      metrics/
    cli/
    adapter-opencode/            <- first adapter (MVP)
    adapter-claude/
    adapter-codex/
    adapter-pi/
  skills/
    delta-response/
      SKILL.md
      references/
    debug-log-slim/
      SKILL.md
      scripts/
    review-delta/
      SKILL.md
    scaffold-fast/
      SKILL.md
    compact-handoff/
      SKILL.md
    delegate-bulk/
      SKILL.md
  examples/
    opencode/
    claude/
    codex/
    pi/
  benchmarks/
    tasks/
    fixtures/
    runners/
    reports/
```

## 7. Phased plan

Runtime/tooling decisions already made: **pnpm + Node** for the monorepo tooling (core, CLI,
benchmarks). The OpenCode adapter package specifically targets Bun (see §5) since that's what
OpenCode plugins run on — this is a deliberate exception, not an inconsistency.

### Phase 0 — Foundations
- Monorepo scaffold: `packages/core`, `skills/`, `benchmarks/`.
- `packages/core/reducers`: first 2 deterministic reducers — test-output-slim (keep only
  FAIL|ERROR-relevant lines) and git-diff-slim. Idempotent, unit tested.
- Micro-benchmark harness (Tier A) using a real tokenizer against fixed fixtures.
- **Deliverable:** reproducible token-reduction numbers, publishable from day one.

### Phase 1 — Skill Pack core
- Ship `delta-response`, `debug-log-slim`, `review-delta` as Agent Skills.
- Validate as an installable skill package (start with OpenCode's skill directory conventions since
  that's the MVP harness; cross-check against Claude Code's `.claude/skills` layout for portability).

### Phase 2 — OpenCode adapter (MVP)
- `packages/adapter-opencode`: plugin implementing `tool.execute.before` to rewrite/slim tool args
  and results using `packages/core/reducers`.
- `experimental.session.compacting` hook wired to `compact-handoff` skill logic.
- Effort routing via policy presets (OpenCode's reasoning-effort equivalent — confirm exact config
  surface when implementing).
- Dry-run by default; explicit install path.

### Phase 3 — CLI, doctor, observability
- `harnesstrim doctor`, `harnesstrim install opencode`, `harnesstrim bench`.
- Telemetry normalizer → `TrimEvent` schema (start with OpenCode's token/session data).
- Policy presets: `lean-debug`, `lean-review`.

### Phase 4 — Expansion to other harnesses
- **Claude Code adapter** — hooks (`PreToolUse`, `PreCompact`, `PostCompact`) + MCP reducer tools
  (`read_slim`/`grep_slim`/`test_slim`) to cover the built-in-tool gap described in §2.3.
- **Codex adapter** — skill bundle + plugin lifecycle hooks.
- **Pi adapter** — TypeScript extension, RPC mode, session parser.
- Tier B end-to-end comparative benchmarks across harnesses.

## 8. Open questions / things to confirm when implementing

- Exact shape of `tool.execute.after` in `@opencode-ai/plugin` (check installed package types).
- OpencCode's exact reasoning-effort / model-config surface for the effort-router integration.
- Whether OpenCode's skill directory convention needs its own adapter-side install step or is
  auto-discovered from `.claude/skills`-compatible paths (per source proposal, OpenCode can read
  `.claude/skills` and `.agents/skills`).
- Real tokenizer choice for Tier A micro-benchmarks (tiktoken vs. Anthropic's tokenizer) — pick per
  target harness's model family, may need both.

## 9. Status log

- **2026-07-11** — Plan reviewed and corrected (see §2). Decision: MVP target is OpenCode, not
  Claude Code. Runtime: pnpm + Node for monorepo, Bun for the OpenCode adapter package specifically.
  Confirmed OpenCode plugin API via docs (see §5). Next: scaffold monorepo (Phase 0).
- **2026-07-11** — Phase 0 complete: monorepo scaffolded (pnpm workspace, root
  package.json/tsconfig.base.json/.gitignore/LICENSE(MIT)/README.md), `packages/core` with two
  deterministic/idempotent reducers (`test-output-slim`, `git-diff-slim`) + 8 passing unit tests
  (`node --test`), and a Tier A micro-benchmark (`benchmarks/`, real `js-tiktoken` cl100k_base
  tokenizer) showing **-65% tokens overall** across 3 fixtures (jest/pytest mostly-pass output,
  a lockfile-heavy git diff) — see `benchmarks/reports/latest.json` for the raw numbers. Phase 1
  also done early: shipped the first 3 skills (`delta-response`, `debug-log-slim`, `review-delta`)
  under `skills/`, matching the Agent Skills frontmatter format (`name`/`description`/`version`/
  `license`) observed in installed Claude Code plugin skills.
  - **Toolchain finding (not previously in this plan):** Node 24's native TypeScript support does
    **not** remap `.js` import specifiers to sibling `.ts` files (unlike `tsc`'s NodeNext
    convention) — relative imports must use the literal `.ts` extension (e.g.
    `from "./types.ts"`) to run un-transpiled via `node file.ts`. Applied throughout
    `packages/core` and `benchmarks`. Keep this in mind if a build step (tsc/esbuild) is added
    later — it would need `allowImportingTsExtensions` or an import-rewrite step.
  - **Bug caught by the idempotency unit test** (worth remembering as a pattern): initial
    `git-diff-slim` implementation only pushed lines inside a matched header or an active hunk;
    a line that was neither (i.e. an already-collapsed marker line from a prior reduction) was
    silently dropped on a second pass. Fixed by always preserving unmatched content lines
    verbatim. Lesson: idempotency tests aren't optional for reducers — they catch exactly this
    class of bug that a single-pass "does it reduce correctly" test won't.
  - Next: Phase 2, OpenCode adapter (`packages/adapter-opencode`, Bun-targeted) implementing
    `tool.execute.before` using these reducers, plus `experimental.session.compacting` wired to
    `compact-handoff` skill logic (not yet written — still queued from §3 Layer 1's remaining 3
    skills: `scaffold-fast`, `compact-handoff`, `delegate-bulk`).
- **2026-07-11** — Phase 2 (OpenCode adapter) complete.
  - **Confirmed the real OpenCode plugin API by reading the installed
    `@opencode-ai/plugin@1.17.18` type declarations** (not just docs). Correction to §5's
    assumption: tool *output* reduction belongs in **`tool.execute.after`**, not
    `tool.execute.before`. Confirmed signatures:
    `tool.execute.after(input:{tool,sessionID,callID,args}, output:{title,output:string,metadata})`
    — mutate `output.output`; and
    `experimental.session.compacting(input:{sessionID}, output:{context:string[],prompt?})`
    — push into `output.context`. `tool.execute.before` only exposes `output.args` (for arg
    rewriting, RTK-style) — kept for later, not used in the MVP.
  - `packages/core`: added a content-based dispatcher (`dispatch.ts`: `pickReducer` /
    `reduceAuto`) so adapters stay thin and detection is unit-tested in core. Has a `minLength`
    threshold (default 400 chars) to avoid churning small/stable content (cache-awareness, §2.2).
  - `packages/adapter-opencode`: thin plugin (`plugin.ts`) delegating to `reduceAuto`, with a
    3-mode config (`active`/`dryrun`/`off`) resolved from opencode.json options → env → defaults
    (`config.ts`), and compaction-handoff injection (`handoff.ts`). Runtime measures by char count
    on purpose — no tokenizer bundled into the harness process (token numbers stay in benchmarks).
  - Added TypeScript **type-checking** across the workspace (was missing): `typescript@7` (native
    compiler) + `@types/node`, base tsconfig switched to `noEmit`+`allowImportingTsExtensions`
    (required because we run `.ts` directly via Node, see the toolchain finding above), `types:
    ["node"]` needed for TS7 to pick up node globals. `pnpm run typecheck` is green on all 3
    packages — this is what validates the plugin against OpenCode's real types.
  - Shipped the `compact-handoff` skill, the adapter README, and `examples/opencode/`.
  - Test/typecheck status: **20 unit tests passing**, typecheck clean. Still queued from §3 Layer 1:
    `scaffold-fast`, `delegate-bulk` skills.
  - Next candidates: Phase 3 (CLI: `harnesstrim doctor` / `install opencode` / `bench`,
    telemetry `TrimEvent` normalizer) OR harden Phase 2 by testing the plugin inside a real
    OpenCode session (the current tests exercise the hooks with mocked inputs, not a live harness —
    see §8: `tool.execute.after` shape is now confirmed, but end-to-end load/behavior is unverified).
- **2026-07-11** — Phase 3 (CLI) MVP complete: `packages/cli` (`bin: harnesstrim`), runnable via
  `node`/Node-24 TS or `pnpm exec harnesstrim` (linked by adding the CLI as a root devDependency).
  Three commands, all end-to-end verified and unit-tested:
  - **`doctor [dir]`** — the entry-point diagnostic (PLAN §3 Layer 3). Pure `inspect(dir)` returns a
    structured `DoctorReport`; flags oversized always-loaded instruction files
    (CLAUDE.md/AGENTS.md/GEMINI.md/.cursorrules/.windsurfrules, warn > 4000 chars), reports skill
    usage across `.claude/skills` / `.opencode/skills` / `.agents/skills` / `skills`, and whether the
    OpenCode adapter is wired into opencode.json. Uses a labeled char/4 estimate (no tokenizer dep in
    the CLI — deliberate, keeps it light).
  - **`install opencode [dir] [--apply]`** — dry-run by default (security model §4); pure
    `planOpencodeInstall(config)` computes the plugin wiring preserving existing keys/plugins,
    idempotent, `--apply` writes opencode.json.
  - **`bench`** — imports `runBench()` from `@harnesstrim/benchmarks/run` (refactored to export it +
    auto-run-if-main), so js-tiktoken only loads on demand.
  - Arg parsing via built-in `node:util parseArgs` (zero deps). 35 tests passing total (14 core +
    6 adapter + 15 cli), typecheck clean on all 4 packages.
  - **Still remaining from Phase 3 (deferred, noted honestly):** telemetry normalizer + `TrimEvent`
    schema, and policy presets (`lean-debug`/`lean-review`). Not started — the CLI MVP covers
    install/doctor/bench, which deliver value without the fragile session-log parsing.
  - Still queued from §3 Layer 1: `scaffold-fast`, `delegate-bulk` skills. Phase 2 live-session
    hardening also still open.
- **2026-07-11** — Phase 3 fully complete (telemetry + presets finished).
  - **Key design decision on telemetry:** rather than scrape each harness's native usage logs
    (unverified, drifting formats), the source of truth is a `TrimEvent` stream the *adapter emits* —
    HarnessTrim measures what HarnessTrim did. `packages/core/src/metrics`: `TrimEvent` schema,
    `summarize()` (totals + per-reducer breakdown, sorted by savings), `parseTrimEvents()` (tolerant
    JSONL parser). Values in chars (matching adapter runtime measurement). Parsing native
    per-harness telemetry for a vanilla-vs-trimmed comparison remains explicit future work.
  - Adapter now emits TrimEvents: `telemetry` (off by default) + `telemetryPath`
    (default `.harnesstrim/metrics.jsonl`) config; `telemetry.ts` file sink swallows write errors so
    telemetry can never break the harness. In `dryrun` it still records what *would* be reduced.
  - `packages/core/src/presets`: `lean-debug`, `lean-review`, `deep-architecture` (a unit test
    asserts every preset references only shipped skills — `lean-scaffold` intentionally deferred
    until the `scaffold-fast` skill exists). Preset = enforceable adapter config + advisory
    skills/effort.
  - CLI gained `preset list` / `preset show <name>`, `metrics [path]`, and `install opencode
    --preset <name>` (bakes the preset's adapter config into the opencode.json plugin tuple, updating
    an existing bare install in place). Verified end-to-end incl. a full adapter→telemetry→metrics
    round-trip (confirmed the minLength threshold correctly skips sub-threshold output).
  - **Test/typecheck status: 54 tests passing (24 core + 9 adapter + 21 cli), typecheck clean on all
    4 packages.**
  - Remaining project work (all Phase-3-external): `scaffold-fast` + `delegate-bulk` skills and the
    `lean-scaffold` preset; Phase 2 live OpenCode-session hardening; Phase 4 (other harness adapters,
    Tier B end-to-end benchmarks); native-telemetry normalization for vanilla-vs-trimmed comparison.
- **2026-07-11** — §3 Layer 1 skill pack now complete: added `scaffold-fast` (mechanical/low-novelty
  work, minimal reasoning) and `delegate-bulk` (when to isolate noisy/volumetric work to a subagent
  or another harness — delegate to shrink the main context, never to duplicate it). Added the
  `lean-scaffold` preset (scaffold-fast + delegate-bulk + delta-response, minimal effort). Hardened
  the preset test to discover shipped skills from the real `skills/` directory (filesystem-backed)
  instead of a hardcoded list, so a preset referencing a missing skill now fails for real. 6 skills
  total; 54 tests still passing, typecheck clean. Next: Phase 2 live-session hardening with OpenCode.
- **2026-07-11** — **Phase 2 hardened against a real OpenCode session** (§8 end-to-end gap closed).
  Installed OpenCode CLI is **1.14.46**; our types were validated against `@opencode-ai/plugin@1.17.18`
  — no drift affecting the hooks we use. Method: a gitignored `.hardening/` scratch project with
  `.opencode/plugin/harnesstrim.ts` re-exporting the workspace adapter (telemetry on, minLength 200).
  Verified, all in a live run (`opencode run -m opencode/deepseek-v4-flash-free`):
  1. Plugin loads clean — the relative adapter import + the `@harnesstrim/core` workspace dep both
     resolve under OpenCode's bundled runtime; hooks register without throwing; exit 0.
  2. `tool.execute.after` fires in the real pipeline: a bash tool call producing 1410 chars of jest-like
     output was reduced to 124 chars (`[harnesstrim] active bash via test-output-slim: 1410 -> 124`),
     and the model received the slimmed output (`omitted 40 passing/noise line(s)` + FAIL + summary).
  3. Telemetry written: one valid `TrimEvent` JSONL line; `harnesstrim metrics` aggregated it to
     `1410 -> 124 (saved 1286, -91.2%)`.
  So the mock-based adapter tests now have a real-session counterpart. `.hardening/` is gitignored
  and reusable for future adapter smoke-tests. Remaining: Phase 4 (Claude Code / Codex / Pi adapters,
  Tier B end-to-end benchmarks) and native-telemetry normalization for vanilla-vs-trimmed comparison.
- **2026-07-11** — Phase 4 started: **Codex and Claude Code adapters shipped** (Pi still pending).
  - **Shared reduction surface — `harnesstrim reduce`**: a pipe-friendly CLI (stdin→stdout via
    `reduceAuto`, RTK-style). This is the portable mechanism for harnesses without a runtime output
    hook. Surfaced a real bug: on tiny inputs a collapse marker can exceed the lines it replaces, so
    added a **safety net in `reduceAuto` — never return output larger than the input** (falls back to
    the original, `changed:false`). New core test covers it.
  - **adapter-codex** (`packages/adapter-codex`): pure `planCodexInstall` — copies the skill pack to
    `.codex/skills` and appends a reduce-pipe instruction to `AGENTS.md` (idempotent via an
    HTML-comment marker). Codex has no tool-output hook, so integration is via its native surfaces
    (Agent Skills + AGENTS.md), matching the source proposal. `install codex` verified end-to-end
    (copy + append + idempotent re-run). **Codex CLI not installed in the env → no live session.**
  - **adapter-claude** (`packages/adapter-claude`): built against the **real Claude Code hooks
    contract** (researched via the claude-code-guide agent, citing official docs). Key finding:
    `PostToolUse` fires for every tool and can rewrite what the model sees via
    `hookSpecificOutput.updatedToolOutput`. So: `buildClaudeHookResponse` (pure hook runtime, exposed
    as `harnesstrim hook claude`, `--log` for debugging) + `planClaudeInstall` (copies skills to
    `.claude/skills`, adds a PostToolUse Bash hook to `.claude/settings.json`, preserving existing
    keys/hooks, idempotent). `install claude` verified end-to-end; hook runtime checked against a
    realistic payload. **Live gap:** the dev shell's `claude -p` subprocess is unauthenticated, so a
    full live session (like OpenCode's) could not be run here — documented in the adapter README;
    verify via `install claude --apply` in a real authenticated project + the hook `--log`.
  - CLI: `install codex|claude`, `hook claude`, `reduce`. Shared skills-source resolver
    (`skills-source.ts`) locates the repo skill pack (single place to change for published packaging).
  - **71 tests passing** (25 core + 9 opencode + 6 codex + 10 claude + 21 cli), typecheck clean on 6
    packages. Remaining: **Pi adapter**, Tier B end-to-end benchmark, native-telemetry normalization.
- **2026-07-12** — **Codex adapter live-validated** (the Phase 4 gap I'd flagged is closed). Codex
  turned out to be installed after all — bundled in the ChatGPT desktop app at
  `%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe` (codex-cli 0.130.0-alpha.5), logged in via ChatGPT.
  Used `codex debug prompt-input` (renders the model-visible prompt as JSON — no model spend) in a
  scratch project after `install codex --apply`: confirmed the AGENTS.md reduce-pipe instruction
  ("Token economy (HarnessTrim)" / `harnesstrim:begin`) and all six installed skills appear in the
  model input. Since the global `~/.codex/skills` holds unrelated skills, the six must come from the
  **project-level `.codex/skills`** — so the adapter's target directory was correct. Key nuance
  recorded in the adapter README: Codex reduction is **instruction-based** (model must choose to pipe
  through `harnesstrim reduce`), unlike OpenCode's **deterministic hook** — an inherent property of
  AGENTS.md/rules integrations, not a defect. Codex CLI also exposes `plugin`/`mcp`/`mcp-server`
  subcommands — a future adapter iteration could register the reducer as an MCP server for
  deterministic, non-instruction reduction. No code change needed; docs updated.
- **2026-07-12** — **MCP reducer server shipped** (`packages/mcp`, `@harnesstrim/mcp`). A stdio MCP
  server built on `@modelcontextprotocol/sdk` (v1.29, API confirmed by reading the installed types —
  `McpServer` + `registerTool(name,{title,description,inputSchema:zodShape},cb)` + `StdioServerTransport`).
  Exposes one tool, `reduce` ({text, minLength?} → slimmed text), delegating to `core.reduceAuto`.
  Started via a new `harnesstrim mcp` CLI command. This is the deterministic, native alternative to
  the Codex AGENTS.md pipe instruction, and is reusable by any MCP client (Codex + Claude Code).
  Verified three ways: unit tests on the pure tool logic, an in-memory MCP client↔server round-trip
  (`InMemoryTransport`), and a **real stdio handshake** — piped `initialize` + `tools/list` into the
  exact `node …/cli.ts mcp` command Codex launches and confirmed `reduce` is discovered; also
  registered/removed it live via `codex mcp add/remove`. 74 tests passing, typecheck clean on 7
  packages. Registration is left as a documented explicit `codex mcp add` step (not auto-run by
  `install codex`) since it edits global Codex config. README now documents MCP-tool vs shell-pipe
  trade-offs. `run-and-reduce` (execute+reduce) intentionally NOT built: it would run commands
  outside the harness sandbox — the shell pipe already covers pre-context token savings safely.
- **2026-07-12** — **Hermes Agent adapter merged (community PR #1 by Gervaso) and live-verified.**
  Adds `packages/adapter-hermes`: a Python plugin hooking Hermes' `transform_tool_result` (fires after
  a tool returns, before the result enters context; returning a string replaces what the model sees).
  For `terminal` output it shells out to `harnesstrim reduce`. Install via `harnesstrim install hermes`
  (dry-run default, idempotent via a `.installed` marker), then enable in Hermes `config.yaml`.
  Review note for the record: I initially blocked the PR believing the hook was fabricated — that was
  **my error**, based on the `/docs` summary. The dedicated hooks page
  (`/docs/user-guide/features/hooks`) documents `transform_tool_result` in a `VALID_HOOKS` list, so
  the contributor's citations were legitimate. The user then **tested it live on Hermes and confirmed
  it works**, so the adapter is now live-verified (README caveat removed). Third harness with a
  deterministic hook-based reducer (OpenCode, Claude Code, Hermes), alongside Codex's instruction/MCP
  path. 79 tests passing, typecheck clean on 8 packages. Remaining: **Pi adapter**, Tier B benchmark.
- **2026-07-12** — **Fidelity metric added to the Tier A benchmark** (prompted by external feedback:
  "the detail I care about is what survives trimming, not a prettier token chart"). The bench now
  measures **signal recall** alongside token reduction: each fixture annotates its must-keep lines
  (the error, failing test, assertion, changed-file headers, summary) in `benchmarks/src/run.ts`, and
  the runner reports how many survived. It also **audits** dropped lines that look like signal
  (tight regex — `fail|failure|exception|traceback|assertionerror`, deliberately excluding bare
  `error`/`warn` to avoid false positives on dependency names like `http-errors` in a collapsed
  lockfile). Result: **−65% tokens at 100% signal recall (15/15), 0 dropped signal lines**. The
  standalone `pnpm run bench` now exits non-zero if recall < 100% or any signal line is dropped, so
  the benchmark doubles as a fidelity gate. README reframed around "what survives" (headline is now
  "−65% tokens at 100% signal recall") and a new "Signal fidelity" KPI row (measured now, vs the
  Tier-B/planned quality-retention row). No core/adapter code changed — this is measurement + docs.
- **2026-07-13** — **Tier B end-to-end framework built** (`benchmarks/tierB/`). Runs the same task
  through OpenCode twice — vanilla (`opencode run --pure`, plugin off) vs trimmed (adapter active,
  auto-loaded from the task's `.opencode/plugin/`) — and compares total tokens + task success
  (quality retention). Recon findings: token usage is extractable (`opencode stats`, session export,
  or `--format json` events); `--pure` is the clean vanilla toggle. Verified deterministically (no
  model): the fixture task's `npm test` output reduces **1235 → 519 chars (~58%)** via `harnesstrim
  reduce` with all signal preserved, and `parse-usage.mjs` correctly extracts tokens+answer from a
  representative event stream. **Live run pending a reachable model**: the reference model host (the
  `GMKtec` provider's LAN box, `NucBox_EVO-X2:1234`) was offline/unresolvable at build time (fails
  DNS and the Windows resolver), and the free cloud model timed out. `MODEL=<id> ./run-e2e.sh`
  produces the live numbers once a tool-calling model is reachable. Framework + docs only; honest that
  the end-to-end token/quality figure is not yet measured. Remaining: **Pi adapter**, and this live run.
- **2026-07-13** — **Tier B live run executed** (after the user updated the OpenCode CLI 1.14→1.17.18,
  which matches our adapter types). Model `opencode/deepseek-v4-flash-free` (Zen). Finding: agentic
  runs hang under `--format json` + redirect, but **streaming works** — so token counts come from
  `opencode export <sessionID>` (summed by `sum-session-tokens.mjs`), not the JSON event stream.
  Result on the one-tool-call task (both runs correctly named the failing test → quality retained):
  fresh non-cache input **1254 → 507 (−59.6%)**, total billed **29,706 → 28,941 (−2.6%)**, and
  **cache read identical (28,032)** in both — the reducer did not bust the prompt cache (cache-
  preservation KPI validated live). Honest framing: the ~60% is on the freshly-billed tool-output
  tokens; the 2.6% session total reflects that OpenCode's ~28k cached system prompt dwarfs a single
  small tool output — savings scale with noisy-output volume vs fixed overhead. Single anecdotal run;
  `run-e2e.sh` + `sum-session-tokens.mjs` are the reproducible harness for larger/multi-run studies.
  Remaining: **Pi adapter**; broader multi-tool-call Tier B runs.
- **2026-07-13** — **Pi adapter shipped** (`packages/adapter-pi`) — the fifth and last target harness.
  API confirmed from Pi's extension docs (not guessed): extensions are `export default (pi:
  ExtensionAPI) => pi.on(event, handler)` loaded from `~/.pi/agent/extensions/` or
  `<project>/.pi/extensions/`, and the **`tool_result`** event fires after a tool finishes and lets
  handlers return a patch (`content`/`details`/`isError`) — Pi's deterministic tool-output hook, like
  OpenCode's `tool.execute.after`. The shipped extension (`extension/harnesstrim.ts`) is
  self-contained (shells out to `harnesstrim reduce`, no workspace imports) so it installs anywhere;
  mode dryrun(default)/active/off + minLength via env, marker-guarded against double reduction.
  `planPiInstall` (pure, unit-tested) + `install-pi.ts` runner copy it into `.pi/extensions/harnesstrim/`
  (idempotent via `.installed`). CLI: `install pi`. **Pi CLI not installed in the env → no live
  session** (honest, like Codex-before-it-turned-up); planner tested, extension syntax-checked, hook
  contract doc-confirmed. 83 tests passing, typecheck clean on 9 packages. All five harnesses now have
  adapters (OpenCode/Claude/Hermes/Pi via deterministic hooks; Codex via instruction + MCP tool).
  Remaining project work: broader multi-tool-call Tier B runs; optional live Pi hardening once the CLI
  is available.

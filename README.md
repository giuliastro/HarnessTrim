# HarnessTrim

**Less tool-output noise. More room for the code and evidence that matter.**

HarnessTrim is a local, cross-harness optimizer for Codex, Claude Code, OpenCode, Hermes,
Pi and OMP. It combines deterministic output reducers, native integrations, portable
skills, and reproducible benchmarks. It does not replace your coding agent or choose a
cheaper model behind your back.

## Start with Codex or Claude

Install the CLI on the PATH used by your harness:

```sh
npm install -g harnesstrim@0.3.1
harnesstrim doctor

# Run inside your project. Omit --apply to preview all writes.
harnesstrim install claude --apply
harnesstrim install codex --apply

# Optional: automatic Codex Bash reduction, after reviewing/trusting the hook.
harnesstrim install codex --hook --apply
```

Claude installation adds a Bash PostToolUse hook, skills and a marker-guarded `CLAUDE.md`
instruction. Codex's default installs skills and an `AGENTS.md` pipe instruction;
`--hook` explicitly adds automatic Bash handling. Reload the harness after installation.
An existing installation that runs `harnesstrim` on PATH uses the upgraded CLI without
rewriting its stable instruction block. See [upgrade details](docs/releases/0.3.0.md).

For one-off diagnosis, `npx harnesstrim doctor` needs no permanent installation. Persistent
hooks still need a resolvable executable: an ephemeral npx invocation is not a global install.

## What 0.3.0 improves

**Claude output that keeps its shape.** Bash replacements preserve the original object,
including stderr, exit codes, interruption flags and unknown metadata. Earlier code returned
only a string, which does not satisfy the documented built-in output schema.

**Codex feedback without losing failures.** The optional Bash hook retains the complete
response envelope and uses `continue: false` plus `stopReason`. It does not use the
`decision: block` response that can reject a nested code-mode tool promise. Unsupported
events, image/rich results and unfamiliar shapes pass through unchanged.

**Safer test compression.** Passing-test lines are removed only when recognized. Long
assertion diffs, unknown output, warnings, command status and the entire failure tail are
kept. A new Node TAP reducer compresses flat successful subtests without flattening suites
or hiding skip/todo, bailouts or diagnostics.

**Faster local execution.** MCP and token counting load on demand. Only the cl100k vocabulary
is bundled. The initial static CLI graph is about 133 KiB instead of the previous 6.3 MiB
single bundle; a build gate prevents regression beyond 256 KiB. The package still has
zero runtime dependencies and includes every lazy chunk and adapter asset.

## Measured evidence, with boundaries

These are deterministic fixture results, **not promises about total session bills or coding
success**. Token counts use `cl100k_base`, not a Claude-specific billing tokenizer.

| Tier A fixture | Before -> after tokens | Reduction | Required signal retained |
| --- | ---: | ---: | ---: |
| Node TAP, 40 successes and one failure | 1666 -> 208 | 87.5% | 8/8 |
| Jest, mostly passing | 408 -> 206 | 49.5% | 6/6 |
| pytest, mostly passing | 395 -> 215 | 45.6% | 5/5 |
| Lockfile-heavy diff | 939 -> 183 | 80.5% | 4/4 |
| JSON array | 527 -> 140 | 73.4% | 3/3 |
| File listing | 508 -> 190 | 62.6% | 3/3 |
| Daily briefing | 196 -> 150 | 23.5% | 3/3 |
| Lint-warning wall | 2221 -> 127 | 94.3% | 5/5 |
| GitHub Actions log | 467 -> 284 | 39.2% | 6/6 |
| pnpm progress | 420 -> 173 | 58.8% | 5/5 |
| **Fixed-fixture total** | **7747 -> 1876** | **75.8%** | **48/48** |

The suite also checks dropped signal, determinism, idempotence and p95 reducer latency
<= 25 ms. The added TAP fixture changes the blend: do not compare aggregate percentages
against the previous nine-fixture total as though the workload were unchanged.

A separate **offline protocol replay** exercises four structured fixtures through both
Claude and Codex. TAP's full response, including metadata, shrinks **1876 -> 259 tokens
(86.2%)** for each adapter while every non-stdout field survives. It does not launch either
harness or an LLM. Live acceptance and task-quality parity remain explicit roadmap gates.

On the same Linux/Node 24.20.0 environment, 30 alternating cold hook processes per build
measured median **71.648 -> 39.249 ms (45.2% lower)**. This measures local startup, not model
latency. Raw samples and reproduction commands are in the [release evidence](docs/releases/0.3.0.md).

Historical live OpenCode Tier B results remain in [benchmarks/tierB](benchmarks/tierB/README.md).
They are not evidence of current Claude/Codex end-to-end quality.

## Choose the integration deliberately

| Harness | Installed path | Scope / important limit |
| --- | --- | --- |
| Claude Code | Bash hook + skills + CLAUDE.md | Structured `updatedToolOutput`; does not intercept built-in Read/Grep/Glob |
| Codex | Skills + AGENTS.md by default | Optional Bash hook; requires supported hooks and user trust |
| OpenCode | Native plugin | In-process result handling |
| Hermes | Plugin | Gateway reload can be needed after updating files |
| Pi | Extension | Project or user scope |
| OMP | tool_result hook | Project or user scope |

```sh
harnesstrim install opencode --apply
harnesstrim install hermes --apply
harnesstrim install pi --apply
harnesstrim install omp --apply
harnesstrim install codex --hook --global --apply
harnesstrim capabilities
```

`--global` with Codex `--hook` installs only `~/.codex/hooks.json`, without editing project
instructions. `--no-hook` (Claude) and `--no-instructions` (Claude/Codex) narrow the write-set.
OpenCode/Pi/OMP/Hermes expose adapter-specific mode/threshold flags; use `--help` and
`capabilities` for exact options, paths and artifact digests.

Installation is dry-run by default. Model choice and reasoning effort are not changed.
`preset list` / `preset show <name>` describe policy suggestions, not automatic model routing.

## Pipes, status and MCP

For commands whose output is not intercepted, reduce before it enters context. In Bash,
preserve failure status rather than accidentally returning the pipe's final success:

```bash
( set -o pipefail; npm test 2>&1 | harnesstrim reduce )
```

That syntax is Bash-specific, not PowerShell or Windows cmd. See the
[shell guidance](docs/codex-claude-optimization.md) for status-safe PowerShell usage.
Do not use a reduced stream as machine-readable TAP/JSON or as compiler input; reducers
produce model-facing summaries, not lossless protocol streams. Keep raw output when needed.

```sh
harnesstrim reduce --stats < build.log
harnesstrim mcp
```

MCP exposes only `reduce(text)`, not unrestricted command execution. A model passing text
it already saw to MCP cannot remove those earlier tokens; hook/pipe reduction before
context ingestion is the preferred saving path. [MCP details](packages/mcp/README.md).

## Local measurements and privacy

```sh
harnesstrim hook claude --metrics .harnesstrim/metrics.jsonl
harnesstrim reduce --metrics .harnesstrim/metrics.jsonl < build.log
harnesstrim metrics .harnesstrim/metrics.jsonl --json
```

Hook commands read hook JSON on stdin; they are normally launched by the harness, not
interactively. Receipts contain counts and reducer/harness identity, never tool payloads
or error messages. Standalone pipe/MCP receipts can include cl100k token counts; hooks
use char counts. An emitted hook receipt proves local processing, **not that the harness
accepted the replacement or that a task succeeded**.

Direct CLI telemetry is off unless enabled. The existing Claude pipe instruction and
optional Codex hook command explicitly include a local metrics path; review the install
preview. No measurements are sent to a remote service. Disabled MCP telemetry performs
no token counting, and telemetry failures cannot break the result.

## Remove an integration

```sh
harnesstrim uninstall claude            # preview
harnesstrim uninstall claude --apply
```

Use the same harness/scope used for installation. Uninstall removes HarnessTrim-owned
artifacts and marker blocks, not unrelated configuration. Always review the preview.

## Develop and validate

```sh
git clone https://github.com/giuliastro/HarnessTrim.git
cd HarnessTrim
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run bench
node packages/cli/build.mjs
bash packages/cli/smoke-test-gate.sh
python packages/adapter-hermes/test/plugin-payload.test.py
```

Development uses Node 24 and native `.ts` imports. `bench` is a checkout command because
fixtures and reports are not part of the published CLI. CI validates Linux, Windows and
macOS and the npm tarball separately. Releases require the same gates before npm publish.

[Current plan](PLAN.md) | [Claude adapter](packages/adapter-claude/README.md) |
[Codex adapter](packages/adapter-codex/README.md) |
[Supervisor/onboarding contract](docs/token-harness-onboarding.md) |
[Historical design and observations](docs/development-history.md)

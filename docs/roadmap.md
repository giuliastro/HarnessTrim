# HarnessTrim product roadmap

Planning date: **2026-09-06**. Status: **planned, not implemented**.
Primary targets: **Codex and Claude Code**. Starting baseline: **0.3.0**.

This document preserves the product direction and version plan from the strategy discussion.
[PLAN.md](../PLAN.md) is the execution entry point and owns the active checklist. Read
[AGENTS.md](../AGENTS.md) before changing code. Completed implementation and measurements
remain in [release notes](releases/0.3.0.md); the earlier design is preserved in
[development-history.md](development-history.md).

Saving this roadmap does not authorize paid model runs, runtime configuration changes,
a new release, or treating proposed features as implemented. Version order expresses
priority and dependencies, not promised delivery dates. Task IDs below are planning
identifiers, not existing GitHub issue numbers.

## 1. Product objective and positioning

**Help Codex and Claude complete more correct work with less waste, keep omitted information
recoverable, and measure the actual effect of each optimization.**

Do not optimize for the highest compression percentage. Optimize for total resources spent
per independently verified completed task, including unsuccessful attempts, extra turns,
retrieval calls, local overhead and retries. Keep task quality and completion time visible.

The differentiator should be knowing **when an optimization is applied, when it helps, and
when to leave the result unchanged**. Cross-harness support and fixture benchmarks alone
are not enough. Preserve local-first operation, explicit installation, low overhead and
honest evidence boundaries. Do not silently lower model quality or reasoning effort.

HarnessTrim remains the optimization and evidence engine. Token Harness or another
supervisor can consume its machine-readable diagnostics, recommendations and results.
Do not build a duplicate standalone monitoring product inside HarnessTrim.

## 2. Competitive context and strategic implications

The following reference leads and interpretations are retained from the 2026-09-06 strategy
discussion. They are not an independently reproduced competitor evaluation or certification
of current upstream APIs. Recheck claims, versions and official contracts when implementation
starts. Third-party benchmark results apply to their stated workloads and configurations;
project marketing percentages are not HarnessTrim evidence.

| Reference | Direction discussed | Implication for HarnessTrim |
| --- | --- | --- |
| [RTK](https://github.com/rtk-ai/rtk) | Compact command output, shell-call rewriting and savings statistics | Compete on effective coverage and verified task efficiency, not the number of supported commands. |
| [Headroom](https://github.com/headroomlabs-ai/headroom) | Cache-aware compression, retrieval of originals, multiple integration surfaces and organizational controls | Cache stability and recoverable context should be requirements, not unsupported claims of uniqueness. |
| [Context Mode](https://github.com/mksglu/context-mode) | Keep large output outside immediate model context and retrieve relevant portions | Move from deleting more lines to presenting the right information with access to the rest. |
| [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) | Cross-harness consolidation and a proxy-oriented direction through Sleev, as discussed upstream | Support a common policy/evidence layer without imposing a proxy on every installation. |
| [Caveman](https://github.com/JuliusBrussee/caveman) | Prompt-driven response concision and context reduction | Concise responses can be optional, but include instruction overhead and do not make style compression the core differentiator. |
| [ccusage](https://ccusage.com/guide/) and [CodexBar](https://github.com/steipete/CodexBar) | Usage, quota and reset visibility | Export trustworthy data; connect observations to useful actions rather than duplicating dashboards. |
| [JetBrains Context](https://blog.jetbrains.com/ai/2026/07/introducing-jetbrains-context-repository-intelligence-for-coding-agents/) and Serena | Repository intelligence and targeted code discovery | Avoid unnecessary reads before compressing them; integrate existing repository tools before building semantic indexing from scratch. |

External evaluation leads:

- [JetBrains evaluation of RTK and Claude Code](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/).
- [JetBrains evaluation of Caveman](https://blog.jetbrains.com/ai/2026/07/speak-to-ai-agents-like-cavemen-tosave-tokens/).

The relevant question is whether smaller tool output translates into lower total task cost.
Coverage gaps, extra tool calls, retrieval, native truncation and cache behavior can reverse
the apparent benefit. JetBrains is also a market participant: its evaluations are useful
methodological leads, not a universal verdict on competing tools.

Four strategic directions follow:

1. **Selection before compression:** return relevant information first and allow precise recovery.
2. **Complement native harness features:** preserve caching, compaction, tool discovery and sandboxing.
3. **Measure completed work:** separate output reduction, integration acceptance and task efficiency.
4. **Make behavior predictable:** versioned contracts, safe rollout, explainable decisions and rollback
   precede enterprise features or centralized policy management.

## 3. Evidence model and success metrics

Maintain three separate evidence levels in reports and the README:

| Level | Question answered | Evidence required |
| --- | --- | --- |
| Reducer | How much output is removed while fixture signals survive? | Fixed fixtures, tokenizer identity, signal audit, determinism, idempotence, non-growth and latency. |
| Integration | Did the harness actually use the modified result? | Pinned versions, controlled probes and an explicit observation method. A local receipt or pre-hook transcript is insufficient. |
| Task | Was correct work completed with fewer resources? | Repeated paired tasks, independent grading, complete accounting and uncertainty reporting. |

Primary efficiency measure: **total resources spent across the evaluated attempts divided by
independently verified successful tasks**, reported alongside success rate. Report zero-success
conditions explicitly rather than dropping them or manufacturing a cost-per-success number.
Also publish per-task paired results so aggregate ratios do not hide workload differences.

Track fresh input, cache reads/writes, output, reasoning where observable, wall time, retries,
repeated calls, recovery calls, local overhead and effective integration coverage. State each
counter's semantics: context snapshot, per-call usage or cumulative total. Do not sum overlapping
fields, reasoning subsets, cumulative snapshots or duplicated session/message totals.

Keep these distinct:

- **Native token usage**, with source and harness/exporter version.
- **Proxy tokenizer estimates**, such as cl100k_base, never relabeled as vendor billing.
- **API cost**, with a stated applicable price basis and exclusions.
- **Subscription quota**, with observed windows, freshness and account scope, not invented credits.

Absent data is unknown, not zero. Shared-account consumption is not attributable to one session
without evidence. A context size snapshot is not cumulative task consumption. Preserve the
baseline's native caching and truncation; do not compare against an artificially inefficient agent.

An initial exploratory target is **10-20% lower resource cost per verified task on suitable
high-output workloads**, subject to quality and variability checks. This is an experimental
objective, not an expected result, release promise or README marketing claim.

## 4. Release sequence

| Version | Priority | Deliverable | Dependency |
| --- | --- | --- | --- |
| 0.3.x | Maintenance | Compatibility/correctness fixes exposed by live checks; no arbitrary increase in compression aggressiveness | Preserve existing quality gates. |
| 0.4.0 | P0 | Verified efficiency: live adapter acceptance, session measurement and initial end-to-end comparisons | Existing 0.3.0 baseline and access to explicitly budgeted live testing. |
| 0.5.0 | P1 | Selective, recoverable context and measured coverage expansion | 0.4 evidence and privacy/security design. |
| 0.6.0 | P1 | Session-waste detection, quota-aware recommendations and conservative policies | Trustworthy 0.4 counters; include 0.5 retrieval overhead. |
| 0.7.0 | P2 | Reliable handoff, resume and supervisor integration | Stable session identity and artifact validity checks. |
| 1.0 | Evidence-gated | Stable contracts and repeatable real-task benefits for Codex and Claude | Live multi-tool quality evidence, compatibility and operational readiness. |

Continue maintaining OpenCode, Pi, OMP and Hermes. Do not expand every adapter simultaneously;
new capability work is focused on Codex and Claude until the main evidence gaps are closed.

## 5. Version 0.4.0: verified efficiency

This is the next feature release. It combines measurement with integration fixes supported
by evidence; it is not a reporting-only release or a more aggressive compression campaign.

### HT-040-01: baseline and evidence contracts

Capture the source commit, package version, harness/model versions, effort, integration mode,
OS, runtime and test environment. Inventory existing reducers, receipts, installers and replay
coverage before implementing anything already present.

Define versioned, additive measurement/probe schemas. Keep attempt IDs, session/call correlation,
observation provenance, timestamps and counter semantics explicit. Use pseudonymous identifiers
where possible; never persist prompts, outputs, raw exception messages or credentials in receipts.

Acceptance: offline fixtures exercise duplicate, cumulative, missing and partial observations;
existing consumers continue to work; no live model or paid access is required for these tests.

### HT-040-02: truthful integration diagnostics

Extend the existing diagnostic surface instead of inventing an unrelated monitor. Distinguish
at least **installed**, **loaded**, **executed** and **replacement accepted**. Each status needs
its own evidence and scope. Unknown or unsupported acceptance must remain unverified.

Design controlled synthetic probes with recognizable signals and a documented observation
method. Never infer model-visible acceptance from a local receipt or a pre-hook transcript.
Do not launch paid probes or alter configuration as a side effect of a normal doctor call.

Acceptance: valid, ignored, malformed and unsupported replacements are distinguishable;
old configurations have a safe fallback; offline tests do not masquerade as live acceptance.

### HT-040-03: session measurement without double counting

Normalize native usage where available and retain provenance and exporter version. Correlate
session, turn, tool call and reduction attempt without forcing all harnesses into identical
counter semantics. Deduplicate stable events and distinguish cumulative snapshots from deltas.

Measure reduction coverage only over the observable eligible calls, and label missing visibility.
Keep native billing, tokenizer estimates and subscription windows separate. Capture quota source
and freshness when available, but defer quota-driven policies to 0.6.

Acceptance: replayed, resumed and concurrent-session fixtures do not inflate consumption;
missing fields remain unknown; telemetry remains opt-in/local/payload-free; disabled paths do
not tokenize or add heavyweight startup work.

### HT-040-04: versioned Codex and Claude compatibility

Check official contracts before changing adapters and record exactly tested combinations.
For Codex cover completed/delayed execution, failures, cancellation, parallel calls and code
mode. For Claude cover structured result replacement, failures, cancellation and coexistence
with other hooks. Include package and Windows/PowerShell behavior where applicable.

Native non-Bash capabilities are research inputs, not permission to broaden the installed hook
matcher automatically. Unsupported versions and result shapes must pass through safely and
explain their fallback. Preserve stdout selection, stderr, status and all unknown metadata.

Acceptance: a compatibility matrix distinguishes documented, offline-replayed and live-verified
support; each defect has a regression test; no universal compatibility claim follows from one run.

### HT-040-05: repeated paired end-to-end evaluation

Build on existing benchmark assets. Start with an exploratory set covering failing-test repair,
long assertion diagnostics, lint/refactoring and multi-file review. Use identical initial repo
states, harness/model settings, effort and independent graders for baseline and trimmed runs.
Randomize or alternate run order and document cold/warm cache conditions. Include native
truncation/caching in both conditions. Record failed runs, timeouts and extra attempts.

Pilot repetitions establish variance; choose the expanded sample and quality/non-inferiority
criteria before confirmatory testing. Do not choose sample size or exclusions after seeing a
favorable percentage. Publish paired results, uncertainty and workload definitions.

Live runs require user-authorized access and an explicit monetary/usage cap. Provide offline
fixtures and runner configuration independently. Never commit credentials or private transcripts.
Sanitize public evidence; keep any necessary raw live data local and access-controlled.

Acceptance: independently grade the produced patches and required task outcomes; distinguish
inconclusive, neutral, improved and regressed conditions. A successful tool invocation alone
is not a passed task. If live access is unavailable, record the blocker and do not claim this
gate is complete.

### HT-040-06: evidence-backed fixes and safe defaults

Fix demonstrated acceptance, accounting or unnecessary-overhead defects. Expand reducer rules
only where repeated measured waste justifies them, with signal regressions written first.
Keep uncertain cases as pass-through and keep unproven optimizations opt-in.

Acceptance: measured wins include retries/recovery/overhead and satisfy the declared quality
criteria. Publish neutral or negative results as well as wins; do not enable a default just to
reach a target compression percentage.

### HT-040-07: release evidence and documentation

Update README with the three evidence levels, compatibility matrix, reproduction instructions
and caveats. Attach sanitized measurements and task/probe schema descriptions to release notes.
State whether a model actually ran and what was measured. Keep older fixture totals comparable
by naming the workload instead of claiming improvement from a changed blend.

Acceptance: all existing release gates pass and the evidence is reviewable. Missing live
acceptance or task evidence blocks describing 0.4 as verified efficiency; document partial
milestones honestly instead of silently weakening the gate.

## 6. Version 0.5.0: selective and recoverable context

### Scope

Introduce an **optional local artifact store** for received outputs. Present concise, conservative
views with scoped references that can retrieve exact ranges or the complete stored payload.
Preserve failure evidence in the initial view; begin by making omitted success/noise details
recoverable. Never describe a summary as lossless merely because recovery is possible.

If the harness already truncated an output, label the artifact as the **received output**, not
the complete original process output. Store truncation/provenance metadata alongside references.

Expand integration coverage gradually: search results and file listings first, then known MCP
result shapes. For source code prefer exact ranges or symbols rather than automatic semantic
summaries. Enable each tool/version combination only after acceptance and fidelity validation.
Integrate existing repository-intelligence tools before building an indexer from scratch.

### Security and privacy

Raw output retention is a distinct opt-in feature, not an extension of payload-free telemetry.
Define TTL, size limits, cleanup, access permissions and per-project/session isolation. Use opaque
artifact handles; defend against path traversal, symlink escapes and cross-session access.
Recovery must not become arbitrary filesystem access or unrestricted command execution.
Do not assume an MCP server automatically inherits the harness sandbox. Make storage and
retrieval contracts explicit and treat stored tool text as untrusted data, not instructions.

### Gate

Measure total task consumption including storage, retrieval, extra turns and misses. Demonstrate
lower initial context and a net task benefit while preserving correctness. Frequent requests to
recover omitted material are a signal to adjust the policy, not to hide the recovery cost.
Expired/missing artifacts must fail safely without pretending the content was recovered.

## 7. Version 0.6.0: session waste and quota-aware policies

### Scope

Detect repeated unchanged-file reads, unnecessarily broad searches, near-identical logs and
attempts that add no new evidence. Begin in **observe/recommend** mode. Recommendations should
state the supporting observations and the proposed action; avoid blocking agent work initially.

Do not cache arbitrary test or shell results. Identical commands can depend on changed state,
environment, network or time. Automate reuse only for operations whose validity can actually be
checked, with invalidation and provenance visible.

Use documented native quota surfaces when available. Preserve user configuration such as an
existing Claude statusline; do not replace it silently. For Codex use supported account/rate-limit
surfaces where accessible and distinguish App Server-managed sessions from unrelated CLI sessions.
Read window durations and reset timestamps from the data rather than hard-coding assumptions.

Missing/stale observations stay unknown. Account-level changes across concurrent sessions do
not prove one task consumed the difference. Do not convert token estimates into subscription
credits without a documented provider mapping.

When remaining capacity is low, suggest narrower exploration, avoidance of redundant work and
a resumable checkpoint. Do not remove required final tests, silently swap models or lower effort.

### Gate

Recommendations reduce verified redundant work without degrading correctness. Only rules that
pass paired end-to-end checks may become opt-in automation; observe mode remains available.
Report quota provenance/freshness and recovery/retry overhead with policy outcomes.

## 8. Version 0.7.0: continuity and supervisor integration

### Scope

Produce a structured handoff with objective, acceptance criteria, decisions, changed files,
checks performed, unresolved failures, artifact references and the next action. This is a
verifiable work state, not a generic narrative summary.

Bind state to repository commit/file fingerprints and revalidate on resume. Mark stale evidence
explicitly; never reuse old test success as proof for changed code. Respect native compaction
and resume mechanisms rather than continuously rewriting stable instruction prefixes.

Stabilize versioned JSON contracts for diagnostics, measurements, handoffs and recommendations.
Allow Token Harness and other supervisors to present results and coordinate resumable work
without introducing a mandatory service or new standalone dashboard.

### Gate

After compaction/resume, agents recover the correct state and perform less duplicate exploration,
without accepting stale facts. Count resumed-task quality and total consumption, not just the
size of the handoff. Test missing artifacts, changed worktrees and interrupted handoff creation.

## 9. Version 1.0: an evidence threshold

Require repeatable benefits on representative real Codex and Claude tasks, explicit supported
versions, reliable install/upgrade/uninstall/rollback, stable machine-readable contracts and
safe behavior when support is absent. Publish the scenarios where HarnessTrim does not help.

Predefine a justified quality non-inferiority margin and use enough evidence to assess it.
Failing to find a statistically significant difference does not establish equivalence.
Keep uncertainty visible and do not promote beyond 0.x solely because fixture compression is high.

## 10. Non-goals and permanent constraints

- No mandatory proxy/daemon or remote telemetry; no enterprise control plane before core benefits.
- No automatic persistent model/effort downgrade or stable-prefix rewriting.
- No unrestricted command-execution MCP tool or sandbox bypass.
- No compression of unfamiliar diagnostics based only on size; fail open and preserve evidence.
- No LLM summarizer on every output without net-cost evidence and explicit consent.
- No standalone dashboard, in-house semantic indexer or simultaneous feature expansion for every adapter.
- No rewrite in another language merely to follow a competitor; profile real session bottlenecks first.
- Preserve deterministic/idempotent/non-growing reducers, full failure evidence, package integrity,
  the lightweight CLI path and existing quality gates.
- Existing instruction/skill assets must not be silently overwritten; any future migration requires
  an explicit preview and user-controlled apply path.

## 11. Implementation reference checkpoints

Recheck the following official sources for the versions under test; a saved URL is not proof
of installed compatibility:

- [Claude hooks](https://code.claude.com/docs/en/hooks).
- [Claude costs and context controls](https://code.claude.com/docs/en/costs).
- [Claude statusline and usage fields](https://code.claude.com/docs/en/statusline).
- [Codex hooks](https://learn.chatgpt.com/docs/hooks).
- [Codex App Server](https://learn.chatgpt.com/docs/app-server).
- [Current HarnessTrim adapter guidance](codex-claude-optimization.md).
- [Supervisor/onboarding contract](token-harness-onboarding.md).

## 12. Start the next implementation session

Read AGENTS.md, PLAN.md, this roadmap and the existing adapter/benchmark code. Complete
**HT-040-01** first, then develop **HT-040-02/03** on offline fixtures before **HT-040-04/05**
live verification. Keep a new task's status unchecked until its acceptance evidence exists.
Record blockers explicitly. The first useful change is a test-backed evidence/diagnostic
contract, not an increase in compression aggressiveness.

Update PLAN.md with completed task IDs, commit/PR references, tests and remaining blockers.
Update this roadmap only when scope, sequencing or acceptance criteria change. Do not repeat
completed 0.3.0 work, report planned commands as available, or publish a release just because
this planning document was saved.

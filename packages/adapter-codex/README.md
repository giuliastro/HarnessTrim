# @harnesstrim/adapter-codex

HarnessTrim adapter for [Codex](https://developers.openai.com/codex).

Codex has no supported in-place tool-output transform like OpenCode, so the stable adapter
integrates through Codex's native surfaces — the Agent Skills standard and the `AGENTS.md`
instruction file:

1. **Skill bundle** — copies the portable skills into `<project>/.codex/skills`.
2. **Reduce-pipe instruction** — appends an `AGENTS.md` section telling the agent to pipe noisy
   command output through `harnesstrim reduce` (deterministic, RTK-style), so only signal enters
   context.

An experimental opt-in `PostToolUse` hook is also available for automatic reduction of simple
Bash results. It uses Codex's block-and-replace fallback because Codex does not yet expose a
supported in-place output replacement field.

## Install

```sh
harnesstrim install codex            # dry-run: shows skills to copy + AGENTS.md snippet
harnesstrim install codex --apply    # writes it
harnesstrim install codex --hook --apply # also add the experimental Bash hook + telemetry
harnesstrim install codex --hook --global --apply # install it once for trusted projects
```

Idempotent: skills already present are skipped, and the AGENTS.md instruction is added only once
(guarded by an HTML-comment marker).

## The reduce pipe

Once installed, the agent is instructed to run, e.g.:

```sh
pytest 2>&1 | harnesstrim reduce
git diff | harnesstrim reduce
```

`harnesstrim reduce` reads stdin, applies the matching reducer, and writes the slimmed output to
stdout (keeping failures/errors/summaries, dropping passing-test noise and generated-file diffs).

## Experimental automatic Bash reduction

`harnesstrim install codex --hook --apply` writes `.codex/hooks.json` with a `PostToolUse`
hook matched to `Bash`. The hook reads Codex's `tool_response`, applies `reduceAuto`, and, only
when it changed the output, returns Codex's documented block-and-replace response containing the
reduced text. It writes one event per reduction to `.harnesstrim/metrics.jsonl`.

This is opt-in because Codex hooks do not yet offer a stable in-place result transformation:

- only supported/simple Bash calls are intercepted;
- Web Search and other non-shell tools are not covered;
- hooks must be reviewed and trusted by Codex before running;
- malformed or unfamiliar response shapes always pass through unchanged.

To enable the hook for all trusted projects without copying skills or changing any project
`AGENTS.md`, use `harnesstrim install codex --hook --global --apply`. This writes the hook to
`~/.codex/hooks.json`; telemetry remains project-local at `.harnesstrim/metrics.jsonl` because
Codex runs hooks with the active project's directory as the working directory.

## Status

The install planner is pure and unit-tested; `install codex` is verified end-to-end (copy + AGENTS.md
append + idempotent re-run).

**Live-validated against the real Codex CLI** (codex-cli 0.130, bundled in the ChatGPT desktop app):
`codex debug prompt-input` — which renders the model-visible prompt — confirms that after
`install codex --apply`, both the AGENTS.md reduce-pipe instruction (the `harnesstrim:begin` /
"Token economy" block) and all six project-level `.codex/skills` reach the model's context. This
confirms Codex reads project-level `.codex/skills` (the global skills dir is `~/.codex/skills`).

Note the distinction from the OpenCode adapter: OpenCode reduces output via a **deterministic hook**,
whereas the Codex reduction is **instruction-based** — the agent is told to pipe through
`harnesstrim reduce`, so the actual piping depends on the model following the instruction (the same
property as any AGENTS.md/rules-based integration).

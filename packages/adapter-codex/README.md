# @harnesstrim/adapter-codex

HarnessTrim adapter for [Codex](https://developers.openai.com/codex).

Codex has no tool-output hook like OpenCode, so this adapter integrates through Codex's native
surfaces — the Agent Skills standard and the `AGENTS.md` instruction file:

1. **Skill bundle** — copies the portable skills into `<project>/.codex/skills`.
2. **Reduce-pipe instruction** — appends an `AGENTS.md` section telling the agent to pipe noisy
   command output through `harnesstrim reduce` (deterministic, RTK-style), so only signal enters
   context.

## Install

```sh
harnesstrim install codex            # dry-run: shows skills to copy + AGENTS.md snippet
harnesstrim install codex --apply    # writes it
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

## Status

The install planner is pure and unit-tested; `install codex` is verified end-to-end (copy + AGENTS.md
append + idempotent re-run). A live Codex session was **not** exercised (Codex CLI not available in
the dev environment) — the integration relies on documented Codex behavior (AGENTS.md instructions +
Agent Skills).

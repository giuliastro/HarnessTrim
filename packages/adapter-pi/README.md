# @harnesstrim/adapter-pi

HarnessTrim adapter for [Pi](https://pi.dev) (`@earendil-works/pi-coding-agent`).

Pi loads TypeScript extensions from `~/.pi/agent/extensions/` (global) or `<project>/.pi/extensions/`
(project-local). Our extension registers a **`tool_result`** handler — Pi's post-tool hook, which
fires after a tool finishes and before the result reaches the model and lets handlers return a patch
(`content` / `details` / `isError`). We slim string `content` for noisy output, analogous to
OpenCode's `tool.execute.after`.

The extension is **self-contained**: it shells out to `harnesstrim reduce` (no workspace imports), so
it loads from any Pi extensions directory. `harnesstrim` must be on PATH; if it's missing the output
passes through unchanged.

## Install

```sh
harnesstrim install pi                    # dry-run
harnesstrim install pi --apply            # -> <project>/.pi/extensions/harnesstrim/
harnesstrim install pi ~ --apply          # global: ~/.pi/... (pass your home dir)
```

Idempotent via a `.installed` marker. Copies the extension bundle; Pi discovers it on next start.

## Mode

| Env var | Default | Meaning |
|---------|---------|---------|
| `HARNESSTRIM_MODE` | `dryrun` | `dryrun` logs to stderr; `active` patches the tool result; `off` disables. |
| `HARNESSTRIM_MINLENGTH` | `400` | Minimum output length before attempting reduction. |

Start in `dryrun`, watch for `[harnesstrim]` stderr lines, then set `HARNESSTRIM_MODE=active`.

## Status

The install planner (`planPiInstall`) is pure and unit-tested; the extension ships with the package
and is syntax-checked. The `tool_result` hook contract is confirmed against Pi's extension docs
(events reference). **Not yet verified in a live Pi session** — the Pi CLI was not installed in the
dev environment. To verify: `harnesstrim install pi --apply`, set `HARNESSTRIM_MODE=active`, run a
command with noisy output in Pi, and confirm the model receives the slimmed version.

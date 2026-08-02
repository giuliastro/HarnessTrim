# @harnesstrim/adapter-pi

HarnessTrim adapter for [Pi](https://pi.dev) (`@earendil-works/pi-coding-agent`).

Pi loads TypeScript extensions from `~/.pi/agent/extensions/` (global) or `<project>/.pi/extensions/`
(project-local). Our extension registers a **`tool_result`** handler — Pi's post-tool hook, which
fires after a tool finishes and before the result reaches the model and lets handlers return a patch
(`content` / `details` / `isError`). We slim text chunks in the structured `content` array for noisy
output, analogous to OpenCode's `tool.execute.after`.

The extension is **self-contained**: it shells out to `harnesstrim reduce` (no workspace imports), so
it loads from any Pi extensions directory. `harnesstrim` must be on PATH; if it's missing the output
passes through unchanged.

> **Discovery note (Pi ≥ 0.82):** Pi's loader only discovers a *subdirectory* extension when it
> contains `index.ts`/`index.js` or a `package.json` with a `pi.extensions` field. The installer
> therefore ships the entry point as `harnesstrim/index.ts` (not `harnesstrim/harnesstrim.ts`), so the
> extension is auto-loaded without settings registration.

## Install

```sh
harnesstrim install pi                    # dry-run
harnesstrim install pi --apply            # -> <project>/.pi/extensions/harnesstrim/
harnesstrim install pi ~ --apply          # global: ~/.pi/... (pass your home dir)
```

Each `--apply` refreshes the extension bundle and its `.installed` marker; Pi discovers the result on
next start.

## Mode

| Env var | Default | Meaning |
|---------|---------|---------|
| `HARNESSTRIM_MODE` | `dryrun` | `dryrun` logs to stderr; `active` patches the tool result; `off` disables. |
| `HARNESSTRIM_MINLENGTH` | `400` | Minimum output length before attempting reduction. |

Start in `dryrun`, watch for `[harnesstrim]` stderr lines, then set `HARNESSTRIM_MODE=active`.

## Status

Verified live on Pi 0.82.1 (2026-08-02), in both install scopes:

- **Discovery fix:** Pi's loader (≥ 0.82) only auto-loads a *subdirectory* extension when it contains
  `index.ts`/`index.js` or a `package.json` with a `pi.extensions` field. The installer ships the entry
  point as `harnesstrim/index.ts`, which is picked up from `<project>/.pi/extensions/` and
  `~/.pi/agent/extensions/` without settings registration. A second `--apply` refreshes the bundle and
  prunes stale files from the installed dir.
- **Dry-run:** with the default `HARNESSTRIM_MODE=dryrun`, the `tool_result` handler fires on `bash`
  and `read` results and logs `[harnesstrim] dryrun tool_result: N -> M chars` to stderr without
  changing anything.
- **Active:** with `HARNESSTRIM_MODE=active`, text chunks are actually replaced — a 13902-char JSON
  array reached the model as 6 lines (3 first + 3 last + `... omitted 74 items ...`) via
  `json-output-slim`, and the model confirmed the omitted middle was genuinely absent.
- **Failure safety:** with `harnesstrim` missing from PATH the output passes through unchanged; output
  that already carries a `[harnesstrim` marker (already reduced) is never reduced twice.
- Non-text chunks are left byte-for-byte untouched (unit-tested via `shouldSkip`; Pi's built-in tools
  only emit text chunks, so this is not live-observable).

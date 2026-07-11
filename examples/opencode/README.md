# OpenCode example

Minimal `opencode.json` wiring the HarnessTrim adapter in **dry-run** mode with debug logging —
the recommended way to try it first. It logs `[harnesstrim] dryrun ...` lines showing what *would*
be reduced, without changing what the model sees.

Once you've confirmed it's picking up the right output, switch `"mode": "dryrun"` to
`"mode": "active"` to actually slim tool output.

See [`packages/adapter-opencode/README.md`](../../packages/adapter-opencode/README.md) for the full
option reference.

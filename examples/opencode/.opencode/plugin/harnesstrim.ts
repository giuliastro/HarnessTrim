// Example HarnessTrim wrapper for OpenCode, in DRY-RUN with debug logging — the
// recommended way to try it first. OpenCode auto-loads plugin files from .opencode/plugin/;
// options are passed here because opencode.json's `plugin` field cannot carry them.
//
// It logs `[harnesstrim] dryrun ...` lines showing what WOULD be reduced without changing
// what the model sees. Switch mode to "active" (and set telemetry: true) once you're happy.
import { HarnessTrim } from "@harnesstrim/adapter-opencode";

export const HarnessTrimPlugin = async (input) =>
  HarnessTrim(input, { mode: "dryrun", debug: true });

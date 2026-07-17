// Tier B loader (large-suite task): re-export the HarnessTrim OpenCode adapter (active,
// telemetry on) so the "trimmed" run slims tool output. The "vanilla" run uses
// `opencode run --pure`, which disables external plugins, so this loader is bypassed.
// Same relative depth as task-failing-test, so the adapter path resolves identically.
import type { Plugin } from "@opencode-ai/plugin";
import { HarnessTrim } from "../../../../../packages/adapter-opencode/src/plugin.ts";

export const HarnessTrimTierB: Plugin = async (input, _options) =>
  HarnessTrim(input, {
    mode: "active",
    telemetry: true,
    telemetryPath: "harnesstrim-metrics.jsonl",
    minLength: 200,
  });

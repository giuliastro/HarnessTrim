import type { Plugin } from "@opencode-ai/plugin";
import { reduceAuto, makeTrimEvent } from "@harnesstrim/core";
import { resolveConfig } from "./config.ts";
import { COMPACTION_HANDOFF_CONTEXT } from "./handoff.ts";
import { createFileSink, noopSink } from "./telemetry.ts";

const HARNESS = "opencode";

/**
 * HarnessTrim OpenCode adapter.
 *
 * - `tool.execute.after`: slims noisy tool output (test runs, git diffs, ...) in place
 *   using the shared core reducers, before it enters the model's context.
 * - `experimental.session.compacting`: injects handoff guidance so compaction keeps
 *   decision-relevant state instead of narrated history.
 *
 * Runtime measurement is by character count (a cheap proxy) on purpose: we don't bundle
 * a tokenizer into the harness process. Token-accurate numbers live in `benchmarks/`.
 *
 * Config via opencode.json plugin options or env (HARNESSTRIM_MODE / _MIN_LENGTH / _DEBUG).
 * See src/config.ts. Default mode is `active` — installing the plugin is the explicit opt-in.
 */
export const HarnessTrim: Plugin = async (_input, options) => {
  const config = resolveConfig(options ?? {});
  const log = (msg: string) => {
    if (config.debug) console.error(`[harnesstrim] ${msg}`);
  };

  if (config.mode === "off") {
    log("mode=off — no hooks active");
    return {};
  }

  const sink = config.telemetry ? createFileSink(config.telemetryPath) : noopSink;

  return {
    "tool.execute.after": async (input, output) => {
      if (typeof output.output !== "string") return;
      // Per-surface selector: when the user installs for a subset of tool families,
      // confine reduction to exactly those tools.
      if (config.toolFilter && !config.toolFilter.includes(input.tool)) return;
      const result = reduceAuto(output.output, config.minLength);
      const before = output.output.length;
      const after = result.output.length;

      if (result.changed) {
        if (config.mode === "active") {
          output.output = result.output;
        }
        sink(
          makeTrimEvent({
            harness: HARNESS,
            tool: input.tool,
            reducer: result.reducer,
            beforeChars: before,
            afterChars: after,
          })
        );
        log(`${config.mode} ${input.tool} via ${result.reducer}: ${before} -> ${after} chars`);
      } else if (result.reductionError !== undefined) {
        sink(
          makeTrimEvent({
            harness: HARNESS,
            tool: input.tool,
            reducer: result.reductionError.reducer,
            beforeChars: before,
            afterChars: before,
            changed: false,
            reductionFailed: true,
          })
        );
        log(`fail-open ${input.tool} via ${result.reductionError.reducer}: original output preserved`);
      } else if (config.trackPassThrough && before >= config.minLength) {
        // Attempted but nothing changed: record the pass-through so `metrics` can
        // report the share of unreduced output (the evidence base for new reducers).
        sink(
          makeTrimEvent({
            harness: HARNESS,
            tool: input.tool,
            reducer: null,
            beforeChars: before,
            afterChars: before,
            changed: false,
          })
        );
      }
    },

    "experimental.session.compacting": async (_compactInput, output) => {
      if (!config.compactionHandoff) return;
      output.context.push(...COMPACTION_HANDOFF_CONTEXT);
      log("injected compaction-handoff context");
    },
  };
};

export default HarnessTrim;

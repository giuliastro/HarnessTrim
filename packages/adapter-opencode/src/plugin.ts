import type { Plugin } from "@opencode-ai/plugin";
import { reduceAuto } from "@harnesstrim/core";
import { resolveConfig } from "./config.ts";
import { COMPACTION_HANDOFF_CONTEXT } from "./handoff.ts";

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

  return {
    "tool.execute.after": async (input, output) => {
      if (typeof output.output !== "string") return;
      const result = reduceAuto(output.output, config.minLength);
      if (!result.changed) return;

      const before = output.output.length;
      const after = result.output.length;
      if (config.mode === "active") {
        output.output = result.output;
      }
      log(`${config.mode} ${input.tool} via ${result.reducer}: ${before} -> ${after} chars`);
    },

    "experimental.session.compacting": async (_compactInput, output) => {
      if (!config.compactionHandoff) return;
      output.context.push(...COMPACTION_HANDOFF_CONTEXT);
      log("injected compaction-handoff context");
    },
  };
};

export default HarnessTrim;

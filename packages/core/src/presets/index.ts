/**
 * Policy presets (PLAN.md §3 Layer 3). A preset bundles a token-economy stance:
 * the adapter config it maps to, which skills to enable, and advisory reasoning
 * effort. The adapter config is the part HarnessTrim can enforce today; effort and
 * skill activation are surfaced as recommendations (the reasoning-effort config
 * surface per harness is not yet wired — see PLAN.md §8).
 *
 * Presets reference only shipped skills.
 */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface PresetAdapterConfig {
  mode: "active" | "dryrun";
  minLength: number;
  compactionHandoff: boolean;
}

export interface Preset {
  name: string;
  description: string;
  adapter: PresetAdapterConfig;
  /** Skill names recommended for this workflow (must be shipped skills). */
  skills: string[];
  reasoningEffort: ReasoningEffort;
  notes: string;
}

export const PRESETS: Record<string, Preset> = {
  "lean-debug": {
    name: "lean-debug",
    description: "Debugging with noisy logs: aggressively slim tool output, keep effort low.",
    adapter: { mode: "active", minLength: 300, compactionHandoff: true },
    skills: ["debug-log-slim", "delta-response"],
    reasoningEffort: "low",
    notes: "Mechanical debug/grep loops rarely need high reasoning; the win is cutting log noise.",
  },
  "lean-review": {
    name: "lean-review",
    description: "Code review focused on problems, not restating the diff.",
    adapter: { mode: "active", minLength: 400, compactionHandoff: true },
    skills: ["review-delta", "delta-response"],
    reasoningEffort: "medium",
    notes: "Review benefits from some reasoning; output discipline avoids diff-narration bloat.",
  },
  "lean-scaffold": {
    name: "lean-scaffold",
    description: "Boilerplate and mechanical transforms: minimal reasoning, terse output.",
    adapter: { mode: "active", minLength: 400, compactionHandoff: true },
    skills: ["scaffold-fast", "delegate-bulk", "delta-response"],
    reasoningEffort: "minimal",
    notes: "Settled-shape work; spend budget on code, and delegate bulk volume to isolated contexts.",
  },
  "deep-architecture": {
    name: "deep-architecture",
    description: "Architecture / complex debugging: preserve more context, allow high reasoning.",
    adapter: { mode: "active", minLength: 800, compactionHandoff: true },
    skills: ["delta-response", "compact-handoff"],
    reasoningEffort: "high",
    notes: "Higher minLength keeps more tool context intact; handoff matters across compaction.",
  },
};

export function getPreset(name: string): Preset | undefined {
  return PRESETS[name];
}

export function listPresets(): Preset[] {
  return Object.values(PRESETS);
}

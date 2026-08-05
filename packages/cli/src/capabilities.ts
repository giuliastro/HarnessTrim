/**
 * Machine-readable capability table for `harnesstrim capabilities`.
 *
 * This is the single source of truth in the repo for what each supported harness's
 * reduction + installer can do in THIS version. `capabilities` serializes it, so scripts,
 * CI, and other consumers can discover and version-check support without hardcoding a
 * per-version table anywhere. Update this file when a surface or an install flag changes.
 */

import { computeHarnessDigests, type HarnessDigests } from "./digests.ts";

export interface CapabilityNarrowing {
  /** The CLI flag that produces the narrower install state. */
  flag: string;
  /** What state the flag produces, e.g. "skills only, no hook". */
  produces: string;
}

export interface HarnessCapabilities {
  /** Adapter package this harness maps to. */
  adapter: string;
  /** Reduction surface(s) the adapter implements. */
  surfaces: string[];
  /** Narrower install states the installer can produce, and the flags that request them. */
  narrowing: CapabilityNarrowing[];
  /** The reviewed write set of `install <harness>` (paths relative to the install dir). */
  writeSet: string[];
}

export interface Capabilities {
  /** CLI version this table describes. */
  version: string;
  harnesses: Record<string, HarnessCapabilities>;
  /**
   * SHA-256 digests of the artifact content this version would write, keyed by the
   * path (relative to the install dir, forward slashes). Consumers hash their copy
   * and compare — the release-verification table that replaces hand-pinned upstream
   * versions. Computed from the same shipped sources `install` reads.
   */
  digests: Record<string, HarnessDigests>;
}

export interface CapabilityState extends HarnessCapabilities {
  /** Per-artifact digests for this harness (see `Capabilities.digests`). */
  digests?: HarnessDigests;
}

export const CAPABILITIES: Record<string, HarnessCapabilities> = {
  opencode: {
    adapter: "@harnesstrim/adapter-opencode",
    surfaces: [
      "tool.execute.after — slims noisy tool output in place before it enters context",
      "experimental.session.compacting — injects compaction-handoff guidance",
    ],
    narrowing: [
      { flag: "--mode active|dryrun|off", produces: "bake the reduction mode into the generated wrapper (active/dryrun/off)" },
      { flag: "--min-length <n>", produces: "leave tool outputs shorter than n chars untouched (overrides preset)" },
      { flag: "--tools <name,...>", produces: "confine reduction to a subset of tool families (e.g. bash,read)" },
      { flag: "--preset <name>", produces: "bake a policy preset's adapter config into the wrapper" },
    ],
    writeSet: [
      ".opencode/plugin/harnesstrim.ts",
      ".opencode/package.json",
      "opencode.json (cleans a stale adapter entry, never adds one)",
    ],
  },
  codex: {
    adapter: "@harnesstrim/adapter-codex",
    surfaces: [
      "PostToolUse Bash hook — deterministic reduction of simple Bash output (optional --hook)",
      "AGENTS.md reduce-pipe instruction — model pipes noisy output through `harnesstrim reduce`",
      "MCP reduce tool — deterministic, instruction-free reduction (separate `harnesstrim mcp`)",
    ],
    narrowing: [
      { flag: "--no-instructions", produces: "skills only — no AGENTS.md reduce-pipe instruction" },
      { flag: "--hook", produces: "also install the experimental Bash PostToolUse hook" },
      { flag: "--global", produces: "install the hook once in ~/.codex (with --hook)" },
    ],
    writeSet: [".codex/skills/", "AGENTS.md (marker-guarded snippet)", ".codex/hooks.json (with --hook)"],
  },
  claude: {
    adapter: "@harnesstrim/adapter-claude",
    surfaces: [
      "PostToolUse Bash hook — spec-correct updatedToolOutput (not honored by Claude Code 2.1.37–2.1.212)",
      "CLAUDE.md reduce-pipe instruction — the effective reduction path on current Claude Code",
    ],
    narrowing: [
      { flag: "--no-hook", produces: "skills only — no PostToolUse hook in .claude/settings.json" },
      { flag: "--no-instructions", produces: "skills only — no CLAUDE.md reduce-pipe instruction" },
    ],
    writeSet: [".claude/skills/", ".claude/settings.json", "CLAUDE.md (marker-guarded snippet)"],
  },
  hermes: {
    adapter: "@harnesstrim/adapter-hermes",
    surfaces: ["transform_tool_result — deterministic reduction before the result enters context"],
    narrowing: [
      { flag: "--mode active|dryrun|off", produces: "bake the reduction mode into the plugin's config.json (env HARNESSTRIM_MODE still wins)" },
      { flag: "--min-length <n>", produces: "bake the min threshold into the plugin's config.json (env HARNESSTRIM_MINLENGTH still wins)" },
    ],
    writeSet: [".hermes/plugins/harnesstrim/ (incl. .installed marker + config.json)"],
  },
  pi: {
    adapter: "@harnesstrim/adapter-pi",
    surfaces: ["tool_result — deterministic reduction of text chunks in structured results"],
    narrowing: [
      { flag: "--mode active|dryrun|off", produces: "bake the reduction mode into the extension's config.json (env HARNESSTRIM_MODE still wins)" },
      { flag: "--min-length <n>", produces: "bake the min threshold into the extension's config.json (env HARNESSTRIM_MINLENGTH still wins)" },
      { flag: "--metrics <path>", produces: "write a TrimEvent JSONL receipt per reduction (proof of interception)" },
    ],
    writeSet: [".pi/extensions/harnesstrim/ (or .pi/agent/extensions/harnesstrim/, incl. .installed marker + config.json)"],
  },
  omp: {
    adapter: "@harnesstrim/adapter-omp",
    surfaces: [
      "tool_result hook in hooks/post/ — deterministic reduction before the result enters context",
      "Loaded by omp with no trust gate and no settings.json entry (file directly under hooks/post/)",
    ],
    narrowing: [
      { flag: "--mode active|dryrun|off", produces: "bake the reduction mode into hooks/harnesstrim.json (env HARNESSTRIM_MODE still wins)" },
      { flag: "--min-length <n>", produces: "bake the min threshold into hooks/harnesstrim.json (env HARNESSTRIM_MINLENGTH still wins)" },
      { flag: "--metrics <path>", produces: "write a TrimEvent JSONL receipt per reduction (proof of interception)" },
    ],
    writeSet: [
      ".omp/hooks/post/harnesstrim.ts (or ~/.omp/agent/hooks/post/harnesstrim.ts)",
      ".omp/hooks/harnesstrim.json (or ~/.omp/agent/hooks/harnesstrim.json)",
    ],
  },
};

export function getCapabilities(version: string): Capabilities {
  return { version, harnesses: { ...CAPABILITIES }, digests: computeHarnessDigests() };
}

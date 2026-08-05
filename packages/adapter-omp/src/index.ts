import path from "node:path";

/**
 * HarnessTrim adapter for OMP (`@oh-my-pi/pi-coding-agent`, CLI `omp`).
 *
 * OMP loads default-export TS hook factories from `~/.omp/agent/hooks/post/*.ts`
 * (global) and `.omp/hooks/post/*.ts` (project). Hooks are non-recursive — the
 * loader scans the directory directly — and carry no trust gate: discovered files
 * are loaded through the extension runner at session start (verified against the
 * 17.2.4 binary and docs; the post/pre discovery+load wiring ship since #2798).
 *
 * Our hook (`hook/harnesstrim.ts`) registers a `tool_result` handler that slims
 * noisy tool output before it reaches the model — OMP's deterministic tool-output
 * hook, analogous to Pi's extension and OpenCode's `tool.execute.after`. Installed
 * by copying the factory into the hooks dir (content-marker-gated for uninstall)
 * and baking the mode/min-length/metrics state into `harnesstrim.json` in the
 * parent hooks dir (outside `post/` so the loader never sees it).
 */

export const OMP_HOOK_NAME = "harnesstrim.ts";
export const OMP_CONFIG_NAME = "harnesstrim.json";
/** Marker comment embedded in the shipped hook, used to recognize the file as ours. */
export const OMP_HOOK_MARKER = "harnesstrim:omp-hook";

/**
 * Config baked into `harnesstrim.json` beside the hooks dir. The hook reads env
 * first (HARNESSTRIM_MODE / HARNESSTRIM_MINLENGTH / HARNESSTRIM_METRICS win at
 * runtime), then this file, then its built-in defaults.
 */
export interface OmpAdapterConfig {
  /** `active` reduces in place; `dryrun` logs only; `off` disables. */
  mode: "active" | "dryrun" | "off";
  /** Tool outputs shorter than this (chars) are left untouched. */
  minLength: number;
  /** When set, append a TrimEvent JSONL receipt per reduction to this path. */
  metrics?: string;
}

/** The config `install omp` writes when no options are given (hook default). */
export const DEFAULT_OMP_ADAPTER_CONFIG: OmpAdapterConfig = { mode: "dryrun", minLength: 400 };

/** True when the value looks like a known hook mode. */
export function isOmpMode(v: unknown): v is OmpAdapterConfig["mode"] {
  return v === "active" || v === "dryrun" || v === "off";
}

/** Merge explicit overrides over an existing/parsed config, keeping the rest. */
export function resolveOmpConfig(
  existing: Partial<OmpAdapterConfig> | null,
  overrides: { mode?: OmpAdapterConfig["mode"]; minLength?: number; metrics?: string } = {}
): OmpAdapterConfig {
  const base = existing ?? DEFAULT_OMP_ADAPTER_CONFIG;
  const config: OmpAdapterConfig = {
    mode: overrides.mode ?? (isOmpMode(base.mode) ? base.mode : DEFAULT_OMP_ADAPTER_CONFIG.mode),
    minLength:
      overrides.minLength ??
      (typeof base.minLength === "number" && base.minLength > 0
        ? base.minLength
        : DEFAULT_OMP_ADAPTER_CONFIG.minLength),
  };
  const metrics = overrides.metrics ?? base.metrics;
  if (typeof metrics === "string" && metrics.length > 0) config.metrics = metrics;
  return config;
}

/** Deterministic, sorted-key JSON for the config file (also used for digests). */
export function bakeOmpConfig(config: OmpAdapterConfig): string {
  const out: Record<string, unknown> = { mode: config.mode, minLength: config.minLength };
  if (config.metrics) out.metrics = config.metrics;
  return JSON.stringify(out, null, 2) + "\n";
}

export interface OmpInstallPlan {
  /** Destination hook file (e.g. ~/.omp/agent/hooks/post/harnesstrim.ts). */
  hookDest: string;
  /** Source hook file (packages/adapter-omp/hook/harnesstrim.ts). */
  hookSource: string;
  /** Destination config file (e.g. ~/.omp/agent/hooks/harnesstrim.json). */
  configDest: string;
  /** True if the hook file exists AND carries our marker (idempotent). */
  alreadyInstalled: boolean;
}

export interface OmpInstallInput {
  /** Target install dir (project root, or the user's home for a global install). */
  installDir: string;
  /** Source dir of the shipped hook (packages/adapter-omp/hook/). */
  hookSourceDir: string;
  /** Whether a file named `harnesstrim.ts` exists in the destination hooks dir. */
  hookFileExists: boolean;
  /** Content of the existing hook file, or null. */
  hookContent: string | null;
  /** Whether installation targets the user's global OMP hooks directory. */
  scope?: "user" | "project";
}

function hooksDir(installDir: string, scope: "user" | "project"): string {
  return scope === "user"
    ? path.join(installDir, ".omp", "agent", "hooks")
    : path.join(installDir, ".omp", "hooks");
}

/**
 * Compute what an OMP install would do. Pure — no filesystem access. The hook is
 * considered already installed when the hook file exists and carries our marker
 * (a same-named file the user wrote independently is never treated as ours).
 */
export function planOmpInstall(input: OmpInstallInput): OmpInstallPlan {
  const scope = input.scope ?? "project";
  const hooks = hooksDir(input.installDir, scope);
  return {
    hookDest: path.join(hooks, "post", OMP_HOOK_NAME),
    hookSource: path.join(input.hookSourceDir, OMP_HOOK_NAME),
    configDest: path.join(hooks, OMP_CONFIG_NAME),
    alreadyInstalled: input.hookFileExists && input.hookContent !== null && input.hookContent.includes(OMP_HOOK_MARKER),
  };
}
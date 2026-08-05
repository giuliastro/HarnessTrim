import path from "node:path";

/**
 * HarnessTrim adapter for Pi (@earendil-works/pi-coding-agent).
 *
 * Pi loads TypeScript extensions from `~/.pi/agent/extensions/` (global) or
 * `<project>/.pi/extensions/` (project-local). Our extension (`extension/index.ts`)
 * registers a `tool_result` handler that slims noisy tool output before it reaches the
 * model — Pi's deterministic tool-output hook, analogous to OpenCode's `tool.execute.after`.
 *
 * The planner is pure (takes the current extension-dir state); a runner in the CLI copies
 * the extension bundle and writes an `.installed` marker for idempotency.
 */
export const PI_EXTENSION_NAME = "harnesstrim";

/**
 * Config baked into `config.json` inside the extension dir. The extension reads env
 * first (HARNESSTRIM_MODE / HARNESSTRIM_MINLENGTH / HARNESSTRIM_METRICS win at
 * runtime), then this file, then its built-in defaults.
 */
export interface PiAdapterConfig {
  /** `active` reduces in place; `dryrun` logs only; `off` disables. */
  mode: "active" | "dryrun" | "off";
  /** Tool outputs shorter than this (chars) are left untouched. */
  minLength: number;
  /** When set, append a TrimEvent JSONL receipt per reduction to this path. */
  metrics?: string;
}

/** The config `install pi` writes when no options are given (extension's own default). */
export const DEFAULT_PI_ADAPTER_CONFIG: PiAdapterConfig = { mode: "dryrun", minLength: 400 };

/** True when the value looks like a known extension mode. */
export function isPiMode(v: unknown): v is PiAdapterConfig["mode"] {
  return v === "active" || v === "dryrun" || v === "off";
}

/** Merge explicit overrides over an existing/parsed config, keeping the rest. */
export function resolvePiConfig(
  existing: Partial<PiAdapterConfig> | null,
  overrides: { mode?: PiAdapterConfig["mode"]; minLength?: number; metrics?: string } = {}
): PiAdapterConfig {
  const base = existing ?? DEFAULT_PI_ADAPTER_CONFIG;
  const config: PiAdapterConfig = {
    mode: overrides.mode ?? (isPiMode(base.mode) ? base.mode : DEFAULT_PI_ADAPTER_CONFIG.mode),
    minLength:
      overrides.minLength ??
      (typeof base.minLength === "number" && base.minLength > 0
        ? base.minLength
        : DEFAULT_PI_ADAPTER_CONFIG.minLength),
  };
  const metrics = overrides.metrics ?? base.metrics;
  if (typeof metrics === "string" && metrics.length > 0) config.metrics = metrics;
  return config;
}

/** Deterministic, sorted-key JSON for the config file (also used for digests). */
export function bakePiConfig(config: PiAdapterConfig): string {
  const out: Record<string, unknown> = { mode: config.mode, minLength: config.minLength };
  if (config.metrics) out.metrics = config.metrics;
  return JSON.stringify(out, null, 2) + "\n";
}

export interface PiInstallPlan {
  /** Destination dir for the extension bundle (e.g. <project>/.pi/extensions/harnesstrim/). */
  extensionDest: string;
  /** Source dir of the shipped extension bundle. */
  extensionSource: string;
  /** True if the extension dir exists AND its marker is present (idempotent). */
  alreadyInstalled: boolean;
}

export interface PiInstallInput {
  /** Target install dir (project root, or the user's home for a global install). */
  installDir: string;
  /** Directory the shipped extension is read from (packages/adapter-pi/extension/). */
  extensionSourceDir: string;
  /** Whether the extension dir already exists at the destination. */
  extensionDirExists: boolean;
  /** Whether the `.installed` marker inside the extension dir indicates a prior install. */
  markerPresent: boolean;
  /** Whether installation targets the user's global Pi extension directory. */
  scope?: "user" | "project";
}

/**
 * Compute what a Pi install would do. Pure — no filesystem access. The extension is
 * considered already installed when its dir exists and the marker is present.
 */
export function planPiInstall(input: PiInstallInput): PiInstallPlan {
  const extensionDest = input.scope === "user"
    ? path.join(input.installDir, ".pi", "agent", "extensions", PI_EXTENSION_NAME)
    : path.join(input.installDir, ".pi", "extensions", PI_EXTENSION_NAME);
  return {
    extensionDest,
    extensionSource: input.extensionSourceDir,
    alreadyInstalled: input.extensionDirExists && input.markerPresent,
  };
}

/** Content of the `.installed` marker written inside the extension dir. */
export function markerFileContent(): string {
  return [
    `# harnesstrim:pi-extension`,
    ``,
    `Installed by \`harnesstrim install pi --apply\`. The extension registers a`,
    `tool_result handler that slims noisy tool output. The installed state lives in`,
    `config.json (mode/minLength/metrics, set via install flags); environment`,
    `HARNESSTRIM_MODE/HARNESSTRIM_MINLENGTH/HARNESSTRIM_METRICS override it at runtime.`,
    `Default mode is dryrun. Remove this directory to uninstall.`,
    ``,
  ].join("\n");
}

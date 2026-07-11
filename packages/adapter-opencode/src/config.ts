import { DEFAULT_MIN_LENGTH } from "@harnesstrim/core";

export type Mode = "active" | "dryrun" | "off";

export interface AdapterConfig {
  /**
   * - `active`  — reduce tool output in place (default once the plugin is installed).
   * - `dryrun`  — measure and log what *would* be reduced, but pass output through unchanged.
   * - `off`     — do nothing.
   */
  mode: Mode;
  /** Tool outputs shorter than this (chars) are left untouched. */
  minLength: number;
  /** Emit one-line `[harnesstrim]` diagnostics to stderr. Off by default. */
  debug: boolean;
  /** Inject compaction-handoff guidance on `experimental.session.compacting`. */
  compactionHandoff: boolean;
  /** Append a TrimEvent JSONL record per reduction. Off by default (telemetry off by default). */
  telemetry: boolean;
  /** Where telemetry JSONL is appended (relative paths resolve against cwd). */
  telemetryPath: string;
}

export const DEFAULT_TELEMETRY_PATH = ".harnesstrim/metrics.jsonl";

function parseMode(value: unknown): Mode | undefined {
  return value === "active" || value === "dryrun" || value === "off" ? value : undefined;
}

/**
 * Resolve config from plugin options (opencode.json) first, then environment
 * variables, then defaults. Env vars: HARNESSTRIM_MODE, HARNESSTRIM_MIN_LENGTH,
 * HARNESSTRIM_DEBUG.
 */
export function resolveConfig(options: Record<string, unknown> = {}): AdapterConfig {
  const env = globalThis.process?.env ?? {};
  const mode = parseMode(options.mode) ?? parseMode(env.HARNESSTRIM_MODE) ?? "active";

  const minFromOptions = typeof options.minLength === "number" ? options.minLength : undefined;
  const minFromEnv = env.HARNESSTRIM_MIN_LENGTH ? Number(env.HARNESSTRIM_MIN_LENGTH) : undefined;
  const minLength =
    minFromOptions ?? (Number.isFinite(minFromEnv) ? (minFromEnv as number) : DEFAULT_MIN_LENGTH);

  const debug = options.debug === true || env.HARNESSTRIM_DEBUG === "1" || env.HARNESSTRIM_DEBUG === "true";
  const compactionHandoff = options.compactionHandoff !== false;

  const telemetry =
    options.telemetry === true || env.HARNESSTRIM_TELEMETRY === "1" || env.HARNESSTRIM_TELEMETRY === "true";
  const telemetryPath =
    (typeof options.telemetryPath === "string" ? options.telemetryPath : undefined) ??
    env.HARNESSTRIM_TELEMETRY_PATH ??
    DEFAULT_TELEMETRY_PATH;

  return { mode, minLength, debug, compactionHandoff, telemetry, telemetryPath };
}

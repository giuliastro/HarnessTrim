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
  /** If set, only reduce outputs for these tool names (e.g. ["bash", "read"]). */
  toolFilter: string[] | null;
  /** Append a TrimEvent JSONL record per reduction. Off by default (telemetry off by default). */
  telemetry: boolean;
  /** Where telemetry JSONL is appended (relative paths resolve against cwd). */
  telemetryPath: string;
  /**
   * Also record pass-through events (attempted reduction, nothing changed) so `metrics`
   * can report a pass-through rate. On by default whenever telemetry is on; opt out
   * with `trackPassThrough: false` or `HARNESSTRIM_TRACK_PASSTHROUGH=0|false`.
   */
  trackPassThrough: boolean;
}

export const DEFAULT_TELEMETRY_PATH = ".harnesstrim/metrics.jsonl";

function parseMode(value: unknown): Mode | undefined {
  return value === "active" || value === "dryrun" || value === "off" ? value : undefined;
}

/** Comma-separated string or array -> tool name list, or null when unset. */
function parseToolFilter(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const names = value.filter((v): v is string => typeof v === "string" && v.length > 0);
    return names.length > 0 ? names : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const names = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return names.length > 0 ? names : null;
  }
  return null;
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
  const toolFilter = parseToolFilter(options.toolFilter) ?? parseToolFilter(env.HARNESSTRIM_TOOLS);

  const telemetry =
    typeof options.telemetry === "boolean"
      ? options.telemetry
      : env.HARNESSTRIM_TELEMETRY === "1" || env.HARNESSTRIM_TELEMETRY === "true";
  const telemetryPath =
    (typeof options.telemetryPath === "string" ? options.telemetryPath : undefined) ??
    env.HARNESSTRIM_TELEMETRY_PATH ??
    DEFAULT_TELEMETRY_PATH;

  const trackPassthroughEnv = env.HARNESSTRIM_TRACK_PASSTHROUGH;
  const trackPassThrough =
    options.trackPassThrough !== false &&
    !(trackPassthroughEnv === "0" || trackPassthroughEnv === "false");

  return { mode, minLength, debug, compactionHandoff, toolFilter, telemetry, telemetryPath, trackPassThrough };
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseTrimEvents, summarize, type TrimSummary } from "@harnesstrim/core";

const HERMES_METRICS_PATH = path.join(os.homedir(), ".hermes", "harnesstrim-metrics.jsonl");
const LOCAL_METRICS_PATH = ".harnesstrim/metrics.jsonl";

/**
 * Prefer Hermes' real plugin telemetry when it exists; otherwise retain the
 * project-local default used by the other adapters.
 */
export const DEFAULT_METRICS_PATH = fs.existsSync(HERMES_METRICS_PATH)
  ? HERMES_METRICS_PATH
  : LOCAL_METRICS_PATH;

export interface MetricsResult {
  path: string;
  found: boolean;
  summary: TrimSummary;
}

/**
 * Load and aggregate a telemetry JSONL file. A missing file is not an error —
 * it just means no reductions were recorded yet (found: false, empty summary).
 */
export function loadMetrics(filePath: string): MetricsResult {
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    raw = null;
  }
  if (raw === null) {
    return { path: filePath, found: false, summary: summarize([]) };
  }
  return { path: filePath, found: true, summary: summarize(parseTrimEvents(raw)) };
}

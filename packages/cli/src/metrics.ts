import fs from "node:fs";
import { parseTrimEvents, summarize, type TrimSummary } from "@harnesstrim/core";

export const DEFAULT_METRICS_PATH = ".harnesstrim/metrics.jsonl";

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

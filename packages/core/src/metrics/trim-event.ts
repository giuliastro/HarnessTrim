/**
 * The normalized unit of HarnessTrim telemetry: one reduction the stack performed.
 *
 * Design note (see PLAN.md §2/§3): rather than scrape each harness's native usage logs
 * (formats that differ and drift), the source of truth is events the adapters *emit* —
 * HarnessTrim measures what HarnessTrim did. Values are in characters, matching what the
 * adapters measure at runtime (no tokenizer in the harness process). Parsing native
 * per-harness telemetry for vanilla-vs-trimmed comparison remains future work.
 */
export interface TrimEvent {
  /** ISO timestamp, stamped by the emitter. */
  ts: string;
  /** Harness that produced the reduction, e.g. "opencode". */
  harness: string;
  /** Tool whose output was reduced, e.g. "bash". */
  tool: string;
  /** Reducer that ran, or null if none matched. */
  reducer: string | null;
  beforeChars: number;
  afterChars: number;
}

export interface ReducerBreakdown {
  reducer: string;
  count: number;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
}

export interface TrimSummary {
  events: number;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  /** Percent reduction over all events, one decimal place. */
  reductionPct: number;
  byReducer: ReducerBreakdown[];
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

/**
 * Aggregate a list of TrimEvents into totals and a per-reducer breakdown.
 * Pure and deterministic (independent of event timestamps). Events with a null
 * reducer contribute to totals but not to the per-reducer breakdown.
 */
export function summarize(events: TrimEvent[]): TrimSummary {
  let beforeChars = 0;
  let afterChars = 0;
  const byReducerMap = new Map<string, ReducerBreakdown>();

  for (const e of events) {
    beforeChars += e.beforeChars;
    afterChars += e.afterChars;
    if (e.reducer === null) continue;
    const b =
      byReducerMap.get(e.reducer) ??
      { reducer: e.reducer, count: 0, beforeChars: 0, afterChars: 0, savedChars: 0 };
    b.count += 1;
    b.beforeChars += e.beforeChars;
    b.afterChars += e.afterChars;
    b.savedChars += e.beforeChars - e.afterChars;
    byReducerMap.set(e.reducer, b);
  }

  const byReducer = [...byReducerMap.values()].sort((a, b) => b.savedChars - a.savedChars);

  return {
    events: events.length,
    beforeChars,
    afterChars,
    savedChars: beforeChars - afterChars,
    reductionPct: pct(beforeChars, afterChars),
    byReducer,
  };
}

/**
 * Parse a JSONL telemetry stream into TrimEvents. Blank lines are skipped;
 * malformed lines are ignored (telemetry should never crash a read). Only lines
 * that structurally look like a TrimEvent are kept.
 */
export function parseTrimEvents(jsonl: string): TrimEvent[] {
  const out: TrimEvent[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isTrimEvent(parsed)) out.push(parsed);
  }
  return out;
}

function isTrimEvent(value: unknown): value is TrimEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.beforeChars === "number" &&
    typeof v.afterChars === "number" &&
    typeof v.tool === "string" &&
    (typeof v.reducer === "string" || v.reducer === null)
  );
}

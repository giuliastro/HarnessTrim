import { randomUUID } from "node:crypto";

/**
 * The normalized unit of HarnessTrim telemetry: one reduction the stack performed.
 *
 * Design note (see PLAN.md §2/§3): rather than scrape each harness's native usage logs
 * (formats that differ and drift), the source of truth is events the adapters *emit* —
 * HarnessTrim measures what HarnessTrim did. Values are in characters, matching what the
 * adapters measure at runtime (no tokenizer in the harness process). Parsing native
 * per-harness telemetry for vanilla-vs-trimmed comparison remains future work.
 *
 * Stream hardening (2026-08-01): every event carries `schemaVersion` (1) and a stable
 * `eventId` so readers can version and dedupe the stream without synthesizing an ID.
 * `beforeTokens`/`afterTokens` are token counts ONLY where the emitting path has them
 * (`null` otherwise — no tokenizer is bundled into harness processes).
 *
 * Token-count emitting paths (2026-08-04): the `reduce` pipe and the MCP server run as
 * SEPARATE processes from any harness, so they bundle a cl100k tokenizer and report
 * exact before/after tokens. In-harness emitters (OpenCode adapter, Claude/Codex hooks,
 * Hermes/Pi/OMP plugins) keep measuring chars only and report `null` tokens.
 *
 * v0.1.0 (2026-08-03): additive `changed` field. `changed: false` marks a recorded
 * pass-through (an attempted reduction that changed nothing) so `metrics` can report a
 * pass-through rate — the denominator for deciding which noisy-output classes still need
 * a reducer. Legacy lines without the field normalize to `changed: true`.
 *
 * Runtime hardening (2026-09-02): additive `reductionFailed` field. A reducer exception
 * is fail-open, so the original payload still reaches the harness; telemetry records only
 * that the reducer failed and its reducer name. Exception messages/payloads are never persisted.
 */
export const TRIM_EVENT_SCHEMA_VERSION = 1;

export interface TrimEvent {
  /** Stream schema version. Lines without it (legacy, pre-2026-08-01) parse as 0. */
  schemaVersion: number;
  /** Stable, per-event ID emitted by the producer (randomUUID). Empty for legacy lines. */
  eventId: string;
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
  /** True when the attempt actually changed the output; false marks a recorded pass-through. */
  changed: boolean;
  /** True only when a matched reducer threw and the original payload passed through unchanged. */
  reductionFailed: boolean;
  /** Token count before reduction, only when the emitting path has one; else null. */
  beforeTokens: number | null;
  /** Token count after reduction, only when the emitting path has one; else null. */
  afterTokens: number | null;
}

/**
 * Build a fully-formed, schema-versioned TrimEvent. Producers should use this instead of
 * hand-rolling the envelope so `schemaVersion`/`eventId` cannot drift between adapters.
 * Token counts default to null (measured only where the emitting path has a tokenizer);
 * `changed` defaults true (reduced), while `reductionFailed` defaults false.
 */
export function makeTrimEvent(
  partial: Omit<
    TrimEvent,
    "schemaVersion" | "eventId" | "ts" | "beforeTokens" | "afterTokens" | "changed" | "reductionFailed"
  > & {
    ts?: string;
    beforeTokens?: number | null;
    afterTokens?: number | null;
    changed?: boolean;
    reductionFailed?: boolean;
  }
): TrimEvent {
  return {
    schemaVersion: TRIM_EVENT_SCHEMA_VERSION,
    eventId: randomUUID(),
    ts: partial.ts ?? new Date().toISOString(),
    harness: partial.harness,
    tool: partial.tool,
    reducer: partial.reducer,
    beforeChars: partial.beforeChars,
    afterChars: partial.afterChars,
    changed: partial.changed ?? true,
    reductionFailed: partial.reductionFailed ?? false,
    beforeTokens: partial.beforeTokens ?? null,
    afterTokens: partial.afterTokens ?? null,
  };
}

export interface ReducerBreakdown {
  reducer: string;
  count: number;
  /** Fail-open exceptions attributed to this reducer. */
  failures: number;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
}

export interface HarnessBreakdown {
  harness: string;
  count: number;
  /** Fail-open reducer exceptions observed on this harness. */
  failures: number;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  /** Percent reduction over that harness's events, one decimal place (negative when it grew). */
  reductionPct: number;
}

export interface TrimSummary {
  /** Total recorded attempts (reduced + pass-through + errors). */
  events: number;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  /** Percent reduction over all events, one decimal place. */
  reductionPct: number;
  byReducer: ReducerBreakdown[];
  /** Per-harness totals, sorted by saved chars descending. */
  byHarness: HarnessBreakdown[];
  /** Attempts that actually shrank the output (changed: true and no growth). */
  reduced: number;
  /** Attempts that changed nothing (changed: false) — the pass-through denominator. */
  passThrough: number;
  /** Percent of recorded attempts that were pass-throughs, one decimal place. */
  passThroughRate: number;
  /** Fail-open reducer exceptions; original payloads were preserved. */
  reducerFailures: number;
  /** Attempts recorded as changed that GROW the output — reducer bugs worth fixing. */
  reductionErrors: number;
  /** Total growth in chars across reduction errors. */
  grewChars: number;
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

/**
 * Aggregate a list of TrimEvents into totals, a per-reducer breakdown, a per-harness
 * breakdown, and attempt accounting (reduced vs pass-through vs errors). Pure and
 * deterministic (independent of event timestamps). Events with a null reducer contribute
 * to totals and the pass-through/error counts but not to the per-reducer breakdown.
 */
export function summarize(events: TrimEvent[]): TrimSummary {
  let beforeChars = 0;
  let afterChars = 0;
  let reduced = 0;
  let passThrough = 0;
  let reducerFailures = 0;
  let reductionErrors = 0;
  let grewChars = 0;
  const byReducerMap = new Map<string, ReducerBreakdown>();
  const byHarnessMap = new Map<string, HarnessBreakdown>();

  for (const e of events) {
    beforeChars += e.beforeChars;
    afterChars += e.afterChars;
    if (e.reductionFailed) {
      reducerFailures++;
    } else if (e.changed === false) {
      passThrough++;
    } else if (e.afterChars > e.beforeChars) {
      reductionErrors++;
      grewChars += e.afterChars - e.beforeChars;
    } else {
      reduced++;
    }

    const harness = e.harness ?? "unknown";
    const h =
      byHarnessMap.get(harness) ??
      {
        harness,
        count: 0,
        failures: 0,
        beforeChars: 0,
        afterChars: 0,
        savedChars: 0,
        reductionPct: 0,
      };
    h.count += 1;
    if (e.reductionFailed) h.failures += 1;
    h.beforeChars += e.beforeChars;
    h.afterChars += e.afterChars;
    h.savedChars += e.beforeChars - e.afterChars;
    byHarnessMap.set(harness, h);

    if (e.reducer === null) continue;
    const b =
      byReducerMap.get(e.reducer) ??
      {
        reducer: e.reducer,
        count: 0,
        failures: 0,
        beforeChars: 0,
        afterChars: 0,
        savedChars: 0,
      };
    b.count += 1;
    if (e.reductionFailed) b.failures += 1;
    b.beforeChars += e.beforeChars;
    b.afterChars += e.afterChars;
    b.savedChars += e.beforeChars - e.afterChars;
    byReducerMap.set(e.reducer, b);
  }

  const byReducer = [...byReducerMap.values()].sort((a, b) => b.savedChars - a.savedChars);
  const byHarness = [...byHarnessMap.values()]
    .map((h) => ({ ...h, reductionPct: pct(h.beforeChars, h.afterChars) }))
    .sort((a, b) => b.savedChars - a.savedChars);

  return {
    events: events.length,
    beforeChars,
    afterChars,
    savedChars: beforeChars - afterChars,
    reductionPct: pct(beforeChars, afterChars),
    byReducer,
    byHarness,
    reduced,
    passThrough,
    passThroughRate: events.length === 0 ? 0 : Math.round((passThrough / events.length) * 1000) / 10,
    reducerFailures,
    reductionErrors,
    grewChars,
  };
}

/**
 * Parse a JSONL telemetry stream into TrimEvents. Blank lines are skipped;
 * malformed lines are ignored (telemetry should never crash a read). Only lines
 * that structurally look like a TrimEvent are kept. Legacy lines (pre-schema,
 * without `schemaVersion`/`eventId`) are normalized to `schemaVersion: 0` and an
 * empty `eventId`, so old streams keep reading.
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
    if (isTrimEvent(parsed)) out.push(normalize(parsed));
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

/** Fill the schema envelope for lines that lack it (legacy streams), pass new lines through. */
function normalize(v: TrimEvent): TrimEvent {
  return {
    schemaVersion: typeof v.schemaVersion === "number" ? v.schemaVersion : 0,
    eventId: typeof v.eventId === "string" ? v.eventId : "",
    ts: v.ts,
    harness: v.harness,
    tool: v.tool,
    reducer: v.reducer,
    beforeChars: v.beforeChars,
    afterChars: v.afterChars,
    changed: typeof v.changed === "boolean" ? v.changed : true,
    reductionFailed: typeof v.reductionFailed === "boolean" ? v.reductionFailed : false,
    beforeTokens: typeof v.beforeTokens === "number" ? v.beforeTokens : null,
    afterTokens: typeof v.afterTokens === "number" ? v.afterTokens : null,
  };
}

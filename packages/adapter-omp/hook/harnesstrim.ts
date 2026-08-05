// HarnessTrim OMP hook — slims noisy tool output via the `tool_result` hook.
// Marker: harnesstrim:omp-hook
//
// omp auto-discovers default-export TS factories in ~/.omp/agent/hooks/post/*.ts
// (global) and .omp/hooks/post/*.ts (project), loads them through its extension
// runner, and fires `tool_result` after every successful tool call BEFORE the
// result reaches the model. Returning `{ content }` replaces the result; returning
// nothing leaves it untouched. Files in hooks/post/ are loaded with no trust gate
// and no settings.json entry, so this hook's handlers bind on session start.
//
// This file is a hook FACTORY, not a harness process — it shells out to
// `harnesstrim reduce` so the reducers live in the shared CLI core. Requires
// `harnesstrim` on PATH; if missing or failing, output passes through unchanged
// (a reducer must never break a tool result).
//
// Config precedence (highest first):
//   1. Environment: HARNESSTRIM_MODE=dryrun|active|off, HARNESSTRIM_MINLENGTH=<chars>,
//      HARNESSTRIM_METRICS=<path>
//   2. config.json beside the hooks dir (written by `harnesstrim install omp --apply`
//      with --mode/--min-length/--metrics)
//   3. built-in defaults: dryrun, minLength 400.
//
// --metrics records a TrimEvent JSONL receipt per reduction (read by
// `harnesstrim metrics`) — the receipt that makes interception verifiable.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const MARKER = "[harnesstrim";
const DEFAULT_MIN_LENGTH = 400;

const HERE =
  (typeof import.meta !== "undefined" && (import.meta as { dirname?: string }).dirname) || "";
const CONFIG_PATH = HERE ? path.join(HERE, "..", "harnesstrim.json") : "";

function readConfig(): { mode?: string; minLength?: number; metrics?: string } {
  if (!CONFIG_PATH) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
    return {
      mode: typeof parsed.mode === "string" ? parsed.mode : undefined,
      minLength: typeof parsed.minLength === "number" ? parsed.minLength : undefined,
      metrics: typeof parsed.metrics === "string" ? parsed.metrics : undefined,
    };
  } catch {
    return {};
  }
}

const baked = readConfig();
const MODE = env.HARNESSTRIM_MODE ?? baked.mode ?? "dryrun";
const MIN_LENGTH = Number(env.HARNESSTRIM_MINLENGTH ?? (baked.minLength ?? DEFAULT_MIN_LENGTH)) || DEFAULT_MIN_LENGTH;
const METRICS_PATH = env.HARNESSTRIM_METRICS || baked.metrics || undefined;

interface TextChunk {
  type: string;
  text?: unknown;
}

function reduce(text: string): { output: string | null; reducer: string | null } {
  try {
    const r = spawnSync("harnesstrim", ["reduce", "--min-length", String(MIN_LENGTH), "--stats"], {
      input: text,
      encoding: "utf8",
      timeout: 30_000,
    });
    const stdout = typeof r.stdout === "string" ? r.stdout : "";
    const stderr = typeof r.stderr === "string" ? r.stderr : "";
    const output = stdout.replace(/\n$/, "");
    if (r.status === 0 && output && output.length > 0) {
      return { output, reducer: parseReducer(stderr) };
    }
  } catch {
    /* harnesstrim not on PATH or failed — pass through */
  }
  return { output: null, reducer: null };
}

function parseReducer(stderr: string): string | null {
  for (const line of stderr.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[harnesstrim reduce]")) {
      const rest = trimmed.slice("[harnesstrim reduce] ".length);
      if (rest.includes(":") && !rest.includes("no reduction")) return rest.split(":")[0].trim();
    }
  }
  return null;
}

function eventTool(event: Record<string, unknown>): string {
  return typeof event.toolName === "string" && event.toolName ? event.toolName : "tool_result";
}

function writeMetric(partial: {
  tool: string;
  reducer: string | null;
  before: number;
  after: number;
  changed: boolean;
}): void {
  if (!METRICS_PATH) return;
  try {
    const event = {
      schemaVersion: 1,
      eventId:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: new Date().toISOString(),
      harness: "omp",
      tool: partial.tool,
      reducer: partial.reducer,
      beforeChars: partial.before,
      afterChars: partial.after,
      changed: partial.changed,
      beforeTokens: null,
      afterTokens: null,
    };
    fs.mkdirSync(path.dirname(path.resolve(METRICS_PATH)), { recursive: true });
    fs.appendFileSync(METRICS_PATH, JSON.stringify(event) + "\n");
  } catch {
    /* telemetry must never break the hook */
  }
}

export default function harnessTrim(pi: { on(event: string, handler: (event: unknown) => unknown): void }): void {
  if (MODE === "off") return;
  pi.on("tool_result", (event) => {
    const ev = event as { content?: TextChunk[] };
    if (!Array.isArray(ev.content)) return;
    let changed = false;
    const content = ev.content.map((chunk: TextChunk) => {
      if (chunk.type !== "text" || typeof chunk.text !== "string") return chunk;
      const text = chunk.text;
      if (text.length < MIN_LENGTH || text.includes(MARKER)) return chunk;

      const { output: reduced, reducer } = reduce(text);
      if (!reduced || reduced.length >= text.length) {
        if (METRICS_PATH) {
          writeMetric({ tool: eventTool(ev), reducer: null, before: text.length, after: text.length, changed: false });
        }
        return chunk;
      }

      if (MODE === "dryrun") {
        process.stderr.write(`[harnesstrim] dryrun OMP tool_result: ${text.length} -> ${reduced.length} chars\n`);
        if (METRICS_PATH) {
          writeMetric({ tool: eventTool(ev), reducer, before: text.length, after: reduced.length, changed: true });
        }
        return chunk;
      }

      changed = true;
      if (METRICS_PATH) {
        writeMetric({ tool: eventTool(ev), reducer, before: text.length, after: reduced.length, changed: true });
      }
      return { ...chunk, text: reduced };
    });
    return changed ? { content } : undefined;
  });
}
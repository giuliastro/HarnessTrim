// HarnessTrim Pi extension — slims noisy tool output via the `tool_result` hook.
//
// Pi fires `tool_result` after a tool finishes and before the result reaches the model;
// handlers chain like middleware and may return a patch ({ content, details, isError }).
// This extension reduces text chunks in structured tool results (test runners, git diffs, ...)
// by shelling out to `harnesstrim reduce`, so it is self-contained (no workspace imports)
// and loads from `~/.pi/agent/extensions/` or `<project>/.pi/extensions/`.
//
// Requires `harnesstrim` on PATH; if it is missing or fails, the output is passed through
// unchanged (a reducer must never break a tool result).
//
// Config precedence (highest first):
//   1. Environment: HARNESSTRIM_MODE=dryrun|active|off, HARNESSTRIM_MINLENGTH=<chars>,
//      HARNESSTRIM_METRICS=<path>   (default dryrun — logs, does not mutate; min 400)
//   2. config.json beside this file (written by `harnesstrim install pi --apply`
//      with --mode/--min-length/--metrics)
//   3. built-in defaults below.
//
// --metrics records a TrimEvent JSONL receipt per reduction attempt (read by
// `harnesstrim metrics`), the receipt that makes interception verifiable.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type TextContent = { type: "text"; text: string };
type ToolContent = TextContent | { type: string; [key: string]: unknown };

interface ToolResultEvent {
  content?: ToolContent[];
  isError?: boolean;
}
interface ExtensionAPI {
  on(event: string, handler: (event: ToolResultEvent, ctx: unknown) => unknown): void;
}

const runtime = globalThis as typeof globalThis & { process?: NodeJS.Process };
const env = runtime.process?.env ?? {};
const MARKER = "[harnesstrim";

/** The directory this extension file lives in (the installed extension dir). */
const HERE =
  (typeof import.meta !== "undefined" &&
    (import.meta as { dirname?: string }).dirname) ||
  "";

interface BakedConfig {
  mode?: string;
  minLength?: number;
  metrics?: string;
}

function readBakedConfig(): BakedConfig {
  if (!HERE) return {};
  try {
    const raw = fs.readFileSync(path.join(HERE, "config.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: typeof parsed.mode === "string" ? parsed.mode : undefined,
      minLength: typeof parsed.minLength === "number" ? parsed.minLength : undefined,
      metrics: typeof parsed.metrics === "string" ? parsed.metrics : undefined,
    };
  } catch {
    return {};
  }
}

function resolveMode(baked: BakedConfig): string {
  return env.HARNESSTRIM_MODE ?? baked.mode ?? "dryrun";
}

function resolveMinLength(baked: BakedConfig): number {
  const raw = env.HARNESSTRIM_MINLENGTH ?? (baked.minLength !== undefined ? String(baked.minLength) : "400");
  return Number(raw) || 400;
}

function resolveMetricsPath(baked: BakedConfig): string | undefined {
  return env.HARNESSTRIM_METRICS || baked.metrics || undefined;
}

// Read the baked config once at load: the file cannot change mid-session without a
// reinstall, and the env vars are the runtime override.
const BAKED = readBakedConfig();
const MODE = resolveMode(BAKED);
const MIN_LENGTH = resolveMinLength(BAKED);
const METRICS_PATH = resolveMetricsPath(BAKED);

/** True when a text chunk should not be reduced: too short, or already reduced. */
export function shouldSkip(text: string, minLength: number): boolean {
  return text.length < minLength || text.includes(MARKER);
}

/** Parse the reducer name from `harnesstrim reduce --stats` stderr, if any. */
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

function reduceViaCli(
  text: string,
): { output: string | null; reducer: string | null; reductionFailed: boolean } {
  try {
    const r = spawnSync("harnesstrim", ["reduce", "--min-length", String(MIN_LENGTH), "--stats"], {
      input: text,
      encoding: "utf8",
      timeout: 30000,
    });
    if (r.status === 0 && typeof r.stdout === "string" && r.stdout.length > 0) {
      const output = r.stdout.replace(/\n$/, "");
      const stderr = typeof r.stderr === "string" ? r.stderr : "";
      const reducer = parseReducer(stderr);
      return {
        output,
        reducer,
        reductionFailed: stderr.includes("reducer failed; original output preserved"),
      };
    }
  } catch {
    /* harnesstrim not on PATH or failed — pass through */
  }
  return { output: null, reducer: null, reductionFailed: false };
}

/** Append a TrimEvent JSONL receipt (self-contained: no workspace imports allowed). */
function writeMetric(partial: {
  tool: string;
  reducer: string | null;
  before: number;
  after: number;
  changed: boolean;
  reductionFailed?: boolean;
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
      harness: "pi",
      tool: partial.tool,
      reducer: partial.reducer,
      beforeChars: partial.before,
      afterChars: partial.after,
      changed: partial.changed,
      reductionFailed: partial.reductionFailed ?? false,
      beforeTokens: null,
      afterTokens: null,
    };
    fs.mkdirSync(path.dirname(path.resolve(METRICS_PATH)), { recursive: true });
    fs.appendFileSync(METRICS_PATH, JSON.stringify(event) + "\n");
  } catch {
    /* telemetry must never break the extension */
  }
}

export default function harnesstrim(pi: ExtensionAPI): void {
  if (MODE === "off") return;
  pi.on("tool_result", async (event) => {
    if (!Array.isArray(event.content)) return;

    let changed = false;
    const content = event.content.map((chunk) => {
      if (chunk.type !== "text" || typeof chunk.text !== "string") return chunk;
      const text = chunk.text;
      if (shouldSkip(text, MIN_LENGTH)) return chunk;

      const { output: reduced, reducer, reductionFailed } = reduceViaCli(text);
      if (!reduced || reduced.length >= text.length) {
        // A reducer exception is a distinct fail-open event; a no-match is a pass-through.
        if (METRICS_PATH) {
          writeMetric({
            tool: eventTool(event),
            reducer: reductionFailed ? reducer : null,
            before: text.length,
            after: text.length,
            changed: false,
            reductionFailed,
          });
        }
        return chunk;
      }

      if (MODE === "dryrun") {
        runtime.process?.stderr?.write(
          `[harnesstrim] dryrun tool_result: ${text.length} -> ${reduced.length} chars\n`
        );
        // Receipt with the would-be counts — dryrun's value is proof it WOULD reduce.
        if (METRICS_PATH) {
          writeMetric({ tool: eventTool(event), reducer, before: text.length, after: reduced.length, changed: true });
        }
        return chunk;
      }

      changed = true;
      if (METRICS_PATH) {
        writeMetric({ tool: eventTool(event), reducer, before: text.length, after: reduced.length, changed: true });
      }
      return { ...chunk, text: reduced };
    });

    return changed ? { content } : undefined;
  });
}

/** Best-effort tool name from the event (Pi's event carries toolName when present). */
function eventTool(event: ToolResultEvent): string {
  const name = (event as ToolResultEvent & { toolName?: string }).toolName;
  return typeof name === "string" && name.length > 0 ? name : "tool_result";
}

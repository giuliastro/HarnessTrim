import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { reduceAuto, makeTrimEvent, DEFAULT_MIN_LENGTH, type TrimEvent } from "@harnesstrim/core";

/** Records a reduction as a TrimEvent (or does nothing). */
export type Sink = (event: TrimEvent) => void;
const noopSink: Sink = () => {};

/** Counts tokens of a text; who provides it decides whether it may run here. */
export type TokenCounter = (text: string) => number;

/**
 * Append TrimEvents as JSONL to `metricsPath`. Best-effort: write failures are swallowed
 * so telemetry can never break the MCP tool. Must never write to stdout (reserved for the
 * MCP protocol) — a file sink is safe.
 */
export function createFileSink(metricsPath: string): Sink {
  return (event) => {
    try {
      const p = path.resolve(metricsPath);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.appendFileSync(p, JSON.stringify(event) + "\n");
    } catch {
      /* telemetry must never break the tool */
    }
  };
}

/**
 * Pure logic behind the `reduce` MCP tool: slim `text` and return it as tool content.
 * Extracted so it can be unit-tested without an MCP transport. Deterministic and
 * idempotent (inherited from core.reduceAuto), and never grows the input. When a `sink`
 * is provided and a reduction happens, records one TrimEvent; with `trackPassThrough`
 * (default true) it also records pass-through events for attempted-but-unchanged input.
 * The MCP server is a standalone process (not inside a harness), so when `countTokens`
 * is provided the events also carry exact before/after token counts.
 */
export function runReduceTool(
  text: string,
  minLength?: number,
  sink: Sink = noopSink,
  trackPassThrough = true,
  countTokens?: TokenCounter
): CallToolResult {
  const result = reduceAuto(text, minLength);
  const threshold = minLength ?? DEFAULT_MIN_LENGTH;
  if (result.changed) {
    sink(
      makeTrimEvent({
        harness: "mcp",
        tool: "reduce",
        reducer: result.reducer,
        beforeChars: text.length,
        afterChars: result.output.length,
        beforeTokens: countTokens ? countTokens(text) : undefined,
        afterTokens: countTokens ? countTokens(result.output) : undefined,
      })
    );
  } else if (result.reductionError !== undefined) {
    sink(
      makeTrimEvent({
        harness: "mcp",
        tool: "reduce",
        reducer: result.reductionError.reducer,
        beforeChars: text.length,
        afterChars: text.length,
        changed: false,
        reductionFailed: true,
        beforeTokens: countTokens ? countTokens(text) : undefined,
        afterTokens: countTokens ? countTokens(text) : undefined,
      })
    );
  } else if (trackPassThrough && text.length >= threshold) {
    sink(
      makeTrimEvent({
        harness: "mcp",
        tool: "reduce",
        reducer: null,
        beforeChars: text.length,
        afterChars: text.length,
        changed: false,
        beforeTokens: countTokens ? countTokens(text) : undefined,
        afterTokens: countTokens ? countTokens(text) : undefined,
      })
    );
  }
  return { content: [{ type: "text", text: result.output }] };
}

const REDUCE_DESCRIPTION =
  "Slim noisy text to its signal: keeps failures, errors, assertions and summaries while dropping " +
  "passing-test noise and generated-file (lockfile/dist) diffs. Pass test-runner output or a git diff " +
  "and use the returned text instead of the raw output. Deterministic and idempotent; returns the " +
  "input unchanged if no reducer matches or it is too short.";

export interface ServerOptions {
  /** Append a TrimEvent JSONL record per reduction to this path (default: no telemetry). */
  metricsPath?: string;
  /** Record pass-through events too (default true when metricsPath is set). */
  trackPassThrough?: boolean;
  /**
   * Token counter for before/after token counts on emitted events. The MCP server
   * runs OUTSIDE harness processes, so the CLI injects its cl100k tokenizer here;
   * without it events report chars only (beforeTokens/afterTokens null).
   */
  countTokens?: TokenCounter;
}

/** Build the HarnessTrim MCP server with the `reduce` tool registered. */
export function createServer(options: ServerOptions = {}): McpServer {
  const sink = options.metricsPath ? createFileSink(options.metricsPath) : noopSink;
  const trackPassThrough = options.trackPassThrough !== false;
  const server = new McpServer({ name: "harnesstrim", version: "0.0.1" });
  server.registerTool(
    "reduce",
    {
      title: "Reduce noisy output",
      description: REDUCE_DESCRIPTION,
      inputSchema: {
        text: z.string().describe("The noisy text to slim (test output, git diff, build log, ...)"),
        minLength: z
          .number()
          .optional()
          .describe("Skip reduction for inputs shorter than this many characters (default 400)"),
      },
    },
    async ({ text, minLength }) => runReduceTool(text, minLength, sink, trackPassThrough, options.countTokens)
  );
  return server;
}

/**
 * Start the server on stdio (used by `harnesstrim mcp`). Pass `metricsPath` (or set
 * `HARNESSTRIM_TELEMETRY_PATH`) to record a TrimEvent per reduction. Pass-through
 * tracking follows `HARNESSTRIM_TRACK_PASSTHROUGH` (default on).
 */
export async function startStdioServer(options: ServerOptions = {}): Promise<void> {
  const metricsPath = options.metricsPath ?? process.env.HARNESSTRIM_TELEMETRY_PATH;
  const envTrack = process.env.HARNESSTRIM_TRACK_PASSTHROUGH;
  const trackPassThrough =
    options.trackPassThrough ?? (envTrack !== undefined ? envTrack !== "0" && envTrack !== "false" : true);
  const server = createServer({ metricsPath, trackPassThrough, countTokens: options.countTokens });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

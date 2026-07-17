import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { reduceAuto, type TrimEvent } from "@harnesstrim/core";

/** Records a reduction as a TrimEvent (or does nothing). */
export type Sink = (event: TrimEvent) => void;
const noopSink: Sink = () => {};

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
 * is provided and a reduction happens, records one TrimEvent.
 */
export function runReduceTool(text: string, minLength?: number, sink: Sink = noopSink): CallToolResult {
  const result = reduceAuto(text, minLength);
  if (result.changed) {
    sink({
      ts: new Date().toISOString(),
      harness: "mcp",
      tool: "reduce",
      reducer: result.reducer,
      beforeChars: text.length,
      afterChars: result.output.length,
    });
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
}

/** Build the HarnessTrim MCP server with the `reduce` tool registered. */
export function createServer(options: ServerOptions = {}): McpServer {
  const sink = options.metricsPath ? createFileSink(options.metricsPath) : noopSink;
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
    async ({ text, minLength }) => runReduceTool(text, minLength, sink)
  );
  return server;
}

/**
 * Start the server on stdio (used by `harnesstrim mcp`). Pass `metricsPath` (or set
 * `HARNESSTRIM_TELEMETRY_PATH`) to record a TrimEvent per reduction.
 */
export async function startStdioServer(options: ServerOptions = {}): Promise<void> {
  const metricsPath = options.metricsPath ?? process.env.HARNESSTRIM_TELEMETRY_PATH;
  const server = createServer({ metricsPath });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

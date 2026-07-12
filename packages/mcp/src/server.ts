import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { reduceAuto } from "@harnesstrim/core";

/**
 * Pure logic behind the `reduce` MCP tool: slim `text` and return it as tool content.
 * Extracted so it can be unit-tested without an MCP transport. Deterministic and
 * idempotent (inherited from core.reduceAuto), and never grows the input.
 */
export function runReduceTool(text: string, minLength?: number): CallToolResult {
  const result = reduceAuto(text, minLength);
  return { content: [{ type: "text", text: result.output }] };
}

const REDUCE_DESCRIPTION =
  "Slim noisy text to its signal: keeps failures, errors, assertions and summaries while dropping " +
  "passing-test noise and generated-file (lockfile/dist) diffs. Pass test-runner output or a git diff " +
  "and use the returned text instead of the raw output. Deterministic and idempotent; returns the " +
  "input unchanged if no reducer matches or it is too short.";

/** Build the HarnessTrim MCP server with the `reduce` tool registered. */
export function createServer(): McpServer {
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
    async ({ text, minLength }) => runReduceTool(text, minLength)
  );
  return server;
}

/** Start the server on stdio (used by `harnesstrim mcp`). */
export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

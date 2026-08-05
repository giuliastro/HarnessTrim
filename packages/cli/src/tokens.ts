import { getEncoding } from "js-tiktoken";

/**
 * Token counting for `harnesstrim reduce` and `harnesstrim mcp`.
 *
 * These two paths are SEPARATE processes from any harness, so bundling a real
 * tokenizer here does not violate the "no tokenizer inside the harness process"
 * constraint (PLAN.md §2/§3): the OpenCode adapter, the Claude/Codex hooks and the
 * Hermes/Pi/OMP plugins all run inside their harness and measure chars only. The
 * pipe and the MCP server run standalone, so they can report exact token counts and
 * make the pipe + MCP the two exact measures on Claude Code.
 *
 * cl100k_base matches the Tier A micro-benchmark tokenizer
 * (benchmarks/src/tokenizer.ts) so telemetry and bench use one counting convention.
 * Counts are a cross-model stand-in — exact per-vendor counts need that vendor's
 * tokenizer (see PLAN.md §8). The tokenizer is initialized lazily and counts never
 * throw: a tokenizer failure degrades to 0/omitted rather than breaking the pipe
 * or the MCP server.
 */
let encoding: ReturnType<typeof getEncoding> | null = null;

function encodingOnce(): ReturnType<typeof getEncoding> {
  encoding ??= getEncoding("cl100k_base");
  return encoding;
}

/** Token count of `text` using cl100k_base; 0 when the tokenizer cannot run. */
export function countTokens(text: string): number {
  try {
    return encodingOnce().encode(text).length;
  } catch {
    return 0;
  }
}

import { reduceAuto } from "@harnesstrim/core";

/** What the Claude hook did: the response JSON to print, and (if it reduced) the facts for telemetry. */
export interface ClaudeReduction {
  /** Hook-response JSON to write to stdout (`{}` when nothing changed). */
  response: string;
  /** Reduction facts for a TrimEvent, or null when no reduction happened. */
  event: {
    tool: string;
    reducer: string | null;
    beforeChars: number;
    afterChars: number;
  } | null;
}

/**
 * Core of the Claude Code PostToolUse hook. Claude pipes a JSON payload on stdin; a
 * PostToolUse hook rewrites what the model sees by returning
 * `hookSpecificOutput.updatedToolOutput`. Returns the response plus, when a reduction
 * happened, the facts needed to record a TrimEvent (for KPI tracking).
 *
 * Defensive: any parse/shape problem yields `{}` (no change) and a null event, because a
 * hook must never corrupt a tool result.
 */
export function reduceClaudePayload(rawJson: string, minLength?: number): ClaudeReduction {
  const extracted = extractToolOutput(rawJson);
  if (extracted === null) return { response: "{}", event: null };

  const result = reduceAuto(extracted.output, minLength);
  if (!result.changed) return { response: "{}", event: null };

  const response = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: result.output,
    },
  });
  return {
    response,
    event: {
      tool: extracted.toolName,
      reducer: result.reducer,
      beforeChars: extracted.output.length,
      afterChars: result.output.length,
    },
  };
}

/** Backward-compatible wrapper returning only the hook-response JSON. */
export function buildClaudeHookResponse(rawJson: string, minLength?: number): string {
  return reduceClaudePayload(rawJson, minLength).response;
}

/** Pull the tool name + textual output from the PostToolUse payload, tolerating shape variants. */
function extractToolOutput(rawJson: string): { toolName: string; output: string } | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const toolName = typeof p.tool_name === "string" ? p.tool_name : "unknown";

  const output = extractOutputText(p);
  return output === null ? null : { toolName, output };
}

function extractOutputText(p: Record<string, unknown>): string | null {
  if (typeof p.tool_output === "string") return p.tool_output;

  const resp = p.tool_response;
  if (typeof resp === "string") return resp;
  if (typeof resp === "object" && resp !== null) {
    const r = resp as Record<string, unknown>;
    for (const key of ["stdout", "output", "content"]) {
      if (typeof r[key] === "string") return r[key] as string;
    }
  }
  return null;
}

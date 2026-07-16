import { reduceAuto } from "@harnesstrim/core";

export interface CodexReduction {
  /** Hook-response JSON to write to stdout (`{}` leaves the result untouched). */
  response: string;
  /** Reduction facts for a TrimEvent, or null when nothing was changed. */
  event: {
    tool: string;
    reducer: string | null;
    beforeChars: number;
    afterChars: number;
  } | null;
}

/**
 * Reduce a Codex PostToolUse payload. Codex currently has no supported in-place
 * `updatedToolOutput` field: the documented fallback is to block normal processing
 * and replace the model-visible result with the hook's reason. Keep this defensive —
 * an unfamiliar tool-response shape must always pass through untouched.
 */
export function reduceCodexPayload(rawJson: string, minLength?: number): CodexReduction {
  const extracted = extractToolOutput(rawJson);
  if (extracted === null) return { response: "{}", event: null };

  const result = reduceAuto(extracted.output, minLength);
  if (!result.changed) return { response: "{}", event: null };

  const response = JSON.stringify({
    decision: "block",
    reason: `HarnessTrim reduced ${extracted.toolName} output (${result.reducer}):\n\n${result.output}`,
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

function extractToolOutput(rawJson: string): { toolName: string; output: string } | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const output = extractOutputText(p.tool_response);
  return output === null
    ? null
    : { toolName: typeof p.tool_name === "string" ? p.tool_name : "unknown", output };
}

function extractOutputText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (typeof response !== "object" || response === null) return null;
  const r = response as Record<string, unknown>;
  for (const key of ["stdout", "output", "content"]) {
    if (typeof r[key] === "string") return r[key] as string;
  }
  return null;
}

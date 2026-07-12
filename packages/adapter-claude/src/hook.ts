import { reduceAuto } from "@harnesstrim/core";

/**
 * Runtime for the Claude Code PostToolUse hook. Claude pipes the hook a JSON payload on
 * stdin; a PostToolUse hook can rewrite what the model sees by returning
 * `hookSpecificOutput.updatedToolOutput` (see the Claude Code hooks reference). This
 * function is the pure core: raw stdin JSON in, hook-response JSON out.
 *
 * Defensive by design: any parse/shape problem yields `{}` (no change), because a hook
 * must never corrupt a tool result. Output that no reducer matches is passed through.
 */
export function buildClaudeHookResponse(rawJson: string, minLength?: number): string {
  const output = extractToolOutput(rawJson);
  if (output === null) return "{}";

  const result = reduceAuto(output, minLength);
  if (!result.changed) return "{}";

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: result.output,
    },
  });
}

/** Pull the tool's textual output from the PostToolUse payload, tolerating shape variants. */
function extractToolOutput(rawJson: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

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

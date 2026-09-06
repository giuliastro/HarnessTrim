/** Extract only the supported Bash channel; never flatten a structured result. */
export interface BashOutput {
  toolName: string;
  text: string;
  /** Model-visible representation used consistently for before/after accounting. */
  before: string;
  replace(text: string): string | Record<string, unknown>;
}

export function extractBashOutput(rawJson: string, allowLegacyOutput = false): BashOutput | null {
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (p.tool_name !== "Bash") return null;
  if (p.hook_event_name !== undefined && p.hook_event_name !== "PostToolUse") return null;
  // The documented field wins. Never silently fall back from a malformed response.
  const value = Object.hasOwn(p, "tool_response")
    ? p.tool_response : allowLegacyOutput ? p.tool_output : undefined;
  if (typeof value === "string") {
    return { toolName: p.tool_name, text: value, before: value, replace: (text) => text };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = value as Record<string, unknown>;
  // Images/rich content are not plain text. Do not turn them into JSON feedback.
  if (output.isImage === true || Array.isArray(output.content)) return null;
  for (const key of ["stdout", "output", "content"]) {
    if (typeof output[key] !== "string") continue;
    return {
      toolName: p.tool_name,
      text: output[key],
      before: JSON.stringify(output),
      // stderr, exit codes, interruption/truncation flags and unknown metadata survive.
      replace: (text) => ({ ...output, [key]: text }),
    };
  }
  return null;
}

export function serializeToolOutput(value: string | Record<string, unknown>): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

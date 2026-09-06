import { reduceAuto, DEFAULT_MIN_LENGTH, extractBashOutput, serializeToolOutput } from "@harnesstrim/core";

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
  /**
   * Set when the payload parsed and a reduction was ATTEMPTED (output >= min-length)
   * but nothing changed — lets the hook record pass-through telemetry. Null otherwise.
   */
  attempt: {
    tool: string;
    beforeChars: number;
    reducer: string | null;
    reductionFailed: boolean;
  } | null;
}


/**
 * Reduce the Bash text channel without losing stderr, status or other metadata.
 * Unknown shapes/events and non-text results fail open. Receipts measure the full
 * model-visible result, not just the selected stdout field.
 */
export function reduceCodexPayload(rawJson: string, minLength?: number): CodexReduction {
  const extracted = extractBashOutput(rawJson, false);
  if (extracted === null) return { response: "{}", event: null, attempt: null };
  const result = reduceAuto(extracted.text, minLength);
  const replacement = extracted.replace(result.output);
  const after = serializeToolOutput(replacement);
  // Serialization/feedback overhead must not turn a nominal reduction into growth.
  if (!result.changed || after.length >= extracted.before.length) {
    return {
      response: "{}", event: null,
      attempt: extracted.text.length >= (minLength ?? DEFAULT_MIN_LENGTH) ? {
        tool: extracted.toolName,
        beforeChars: extracted.before.length,
        reducer: result.reductionError?.reducer ?? null,
        reductionFailed: result.reductionError !== undefined,
      } : null,
    };
  }
  return {
    response: JSON.stringify({
    // Unlike decision:block, continue:false does not reject a code-mode tool promise.
    // This only replaces processing of the completed result, not the agent turn.
    continue: false,
    stopReason: after,
  }),
    event: {
      tool: extracted.toolName, reducer: result.reducer,
      beforeChars: extracted.before.length, afterChars: after.length,
    },
    attempt: null,
  };
}

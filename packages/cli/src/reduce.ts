import { reduceAuto, type AutoReduceResult } from "@harnesstrim/core";

/** Read all of stdin as a UTF-8 string. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface PipeReduceResult extends AutoReduceResult {
  beforeChars: number;
  afterChars: number;
}

/**
 * Reduce a blob of text for the pipe command. Thin wrapper over core.reduceAuto that
 * also reports before/after sizes for the optional --stats line. Kept pure so it is
 * testable without wiring up stdin.
 */
export function reducePipe(input: string, minLength?: number): PipeReduceResult {
  const result = reduceAuto(input, minLength);
  return { ...result, beforeChars: input.length, afterChars: result.output.length };
}

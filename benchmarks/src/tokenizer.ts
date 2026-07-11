import { getEncoding } from "js-tiktoken";

const encoding = getEncoding("cl100k_base");

/**
 * Token count using a real BPE tokenizer (cl100k_base) as a cross-model stand-in.
 * Reduction percentages are comparable across fixtures even though exact counts
 * won't match a specific vendor's tokenizer (see PLAN.md §8 on tokenizer choice).
 */
export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

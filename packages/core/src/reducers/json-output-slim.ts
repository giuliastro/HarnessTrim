import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:json-output-slim]";

// How many leading items to keep unconditionally
const LEADING_ITEMS = 3;
// How many trailing items to keep unconditionally
const TRAILING_ITEMS = 3;
// Minimum array length before we bother reducing
const MIN_ARRAY_LENGTH = 20;
// Maximum object key-value pairs before collapsing inner objects
const MAX_OBJECT_KEYS = 15;

/**
 * Reduces large JSON output (API responses, tool results, config dumps)
 * by:
 *   - Truncating long arrays: keeps first N + last N items with a count marker
 *   - Collapsing deeply nested objects with many keys
 *
 * Deterministic and idempotent: once collapsed, the marker lines are preserved
 * on re-reduction because they don't match the JSON array/object patterns
 * that trigger reduction.
 */
export const jsonOutputSlim: Reducer = {
  name: "json-output-slim",
  reduce(input: string): ReducerResult {
    // Try to parse as JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      // Not valid JSON — try to find JSON blocks within the text
      return tryExtractJsonBlocks(input);
    }

    if (Array.isArray(parsed)) {
      return reduceArray(parsed, input);
    }

    if (typeof parsed === "object" && parsed !== null) {
      return reduceObject(parsed as Record<string, unknown>, input);
    }

    return { output: input, changed: false };
  },
};

function reduceArray(arr: unknown[], originalInput: string): ReducerResult {
  if (arr.length < MIN_ARRAY_LENGTH) {
    return { output: originalInput, changed: false };
  }

  const n = arr.length;
  const keptCount = LEADING_ITEMS + TRAILING_ITEMS;

  if (n <= keptCount) {
    return { output: originalInput, changed: false };
  }

  const leading = arr.slice(0, LEADING_ITEMS);
  const trailing = arr.slice(n - TRAILING_ITEMS);

  const out: string[] = [
    `${MARKER_PREFIX} array with ${n} total items, showing ${LEADING_ITEMS} first + ${TRAILING_ITEMS} last`,
  ];

  for (const item of leading) {
    out.push(jsonPreview(item));
  }

  out.push(`${MARKER_PREFIX} ... omitted ${n - keptCount} items ...`);

  for (const item of trailing) {
    out.push(jsonPreview(item));
  }

  return {
    output: out.join("\n"),
    changed: true,
    note: `collapsed JSON array from ${n} to ${keptCount} visible items`,
  };
}

function reduceObject(obj: Record<string, unknown>, originalInput: string): ReducerResult {
  const keys = Object.keys(obj);
  // Check for any long arrays inside the object (recursive reduction)
  let hasLongArray = false;
  for (const key of keys) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length >= MIN_ARRAY_LENGTH) {
      hasLongArray = true;
    }
  }

  if (keys.length < MAX_OBJECT_KEYS && !hasLongArray) {
    return { output: originalInput, changed: false };
  }

  const keyCount = keys.length;
  const out: string[] = [];

  if (keyCount >= MAX_OBJECT_KEYS) {
    out.push(
      `${MARKER_PREFIX} object with ${keyCount} keys, first ${MAX_OBJECT_KEYS} shown`,
    );
  }

  const shownKeys = keys.slice(0, Math.min(keyCount, MAX_OBJECT_KEYS));
  let changed = false;

  for (const key of shownKeys) {
    const val = obj[key];
    if (Array.isArray(val) && val.length >= MIN_ARRAY_LENGTH) {
      // Reduce the array inline
      const arrResult = reduceArray(val, JSON.stringify(val));
      if (arrResult.changed) {
        changed = true;
        out.push(`  "${key}": [reduced: ${val.length} items]`);
        continue;
      }
    }
    out.push(`  "${key}": ${jsonPreview(val, true)}`);
  }

  if (keyCount >= MAX_OBJECT_KEYS) {
    const omitted = keyCount - MAX_OBJECT_KEYS;
    out.push(`  ${MARKER_PREFIX} ... omitted ${omitted} keys ...`);
    changed = true;
  }

  if (!changed) {
    return { output: originalInput, changed: false };
  }

  return {
    output: out.join("\n"),
    changed: true,
    note: hasLongArray
      ? `collapsed nested array(s) inside object`
      : `collapsed JSON object from ${keyCount} to ${MAX_OBJECT_KEYS} keys`,
  };
}

function jsonPreview(value: unknown, inline = false): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    const short = value.length > 80 ? value.slice(0, 77) + "..." : value;
    return JSON.stringify(short);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (inline) return `[${value.length} items]`;
    if (value.length <= 5) {
      return value.map((v) => jsonPreview(v, true)).join("\n");
    }
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    if (inline) return `{${keys.length} keys}`;
    if (keys.length <= 5) {
      return JSON.stringify(value).slice(0, 200) + "...";
    }
    return `{${keys.length} keys}`;
  }
  return String(value);
}

/**
 * Reduce every independently parseable JSON block that begins on a line boundary.
 * Keeping the scan in one pass avoids a marker from preventing a later block from
 * being reduced on a subsequent invocation.
 */
function tryExtractJsonBlocks(input: string): ReducerResult {
  let cursor = 0;
  let output = "";
  let changed = false;

  while (cursor < input.length) {
    const match = input.slice(cursor).match(/^[\t ]*[\[{]/m);
    if (!match || match.index === undefined) {
      output += input.slice(cursor);
      break;
    }

    const start = cursor + match.index + match[0].search(/[\[{]/);
    const end = findJsonBlockEnd(input, start);
    if (end === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, start);
    const jsonBlock = input.slice(start, end);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch {
      // This was only JSON-looking prose. Preserve it and keep scanning.
      output += input.slice(start, start + 1);
      cursor = start + 1;
      continue;
    }

    const result = Array.isArray(parsed)
      ? reduceArray(parsed, jsonBlock)
      : typeof parsed === "object" && parsed !== null
        ? reduceObject(parsed as Record<string, unknown>, jsonBlock)
        : { output: jsonBlock, changed: false };
    output += result.output;
    changed ||= result.changed;
    cursor = end;
  }

  return changed
    ? { output, changed: true, note: "reduced embedded JSON block(s)" }
    : { output: input, changed: false };
}

function findJsonBlockEnd(input: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

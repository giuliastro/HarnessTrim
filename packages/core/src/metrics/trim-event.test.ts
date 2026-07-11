import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, parseTrimEvents, type TrimEvent } from "./trim-event.ts";

const events: TrimEvent[] = [
  { ts: "t1", harness: "opencode", tool: "bash", reducer: "test-output-slim", beforeChars: 1000, afterChars: 400 },
  { ts: "t2", harness: "opencode", tool: "bash", reducer: "git-diff-slim", beforeChars: 900, afterChars: 200 },
  { ts: "t3", harness: "opencode", tool: "bash", reducer: "test-output-slim", beforeChars: 500, afterChars: 300 },
  { ts: "t4", harness: "opencode", tool: "read", reducer: null, beforeChars: 100, afterChars: 100 },
];

test("summarize totals and percentage", () => {
  const s = summarize(events);
  assert.equal(s.events, 4);
  assert.equal(s.beforeChars, 2500);
  assert.equal(s.afterChars, 1000);
  assert.equal(s.savedChars, 1500);
  assert.equal(s.reductionPct, 60);
});

test("summarize per-reducer breakdown, sorted by savings desc", () => {
  const s = summarize(events);
  assert.equal(s.byReducer.length, 2);
  // test-output-slim saved 600+200=800; git-diff-slim saved 700 → test-output-slim first.
  assert.equal(s.byReducer[0].reducer, "test-output-slim");
  assert.equal(s.byReducer[0].savedChars, 800);
  assert.equal(s.byReducer[0].count, 2);
  assert.equal(s.byReducer[1].reducer, "git-diff-slim");
  assert.equal(s.byReducer[1].savedChars, 700);
});

test("summarize handles empty input", () => {
  const s = summarize([]);
  assert.equal(s.events, 0);
  assert.equal(s.reductionPct, 0);
  assert.deepEqual(s.byReducer, []);
});

test("parseTrimEvents skips blank and malformed lines", () => {
  const jsonl =
    JSON.stringify(events[0]) +
    "\n\n" +
    "{ not json\n" +
    JSON.stringify({ foo: "bar" }) + // structurally not a TrimEvent
    "\n" +
    JSON.stringify(events[1]) +
    "\n";
  const parsed = parseTrimEvents(jsonl);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].reducer, "test-output-slim");
  assert.equal(parsed[1].reducer, "git-diff-slim");
});

test("parseTrimEvents accepts null reducer events", () => {
  const parsed = parseTrimEvents(JSON.stringify(events[3]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].reducer, null);
});

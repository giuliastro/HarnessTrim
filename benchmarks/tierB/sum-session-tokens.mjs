// Sum token usage from an `opencode export <sessionID>` JSON dump.
//
// Export shape: { info, messages: [ { info: { tokens }, parts: [...] }, ... ] }.
// Each assistant message's token record appears TWICE — in `messages[i].info.tokens`
// AND (duplicated) in `messages[i].parts[N].tokens` — and there is also a session-level
// `info.tokens` at the top. Summing every token object (a naive deep walk) double-counts.
// So we count exactly one record per message: `messages[i].info.tokens`.
//
// Usage: node sum-session-tokens.mjs <session.json>
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node sum-session-tokens.mjs <session.json>");
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const total = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
let messages = 0;

const list = Array.isArray(data?.messages) ? data.messages : [];
for (const m of list) {
  const t = m?.info?.tokens;
  if (!t || typeof t.input !== "number") continue; // skip user messages (no token record)
  messages++;
  total.input += t.input || 0;
  total.output += t.output || 0;
  total.reasoning += t.reasoning || 0;
  if (t.cache && typeof t.cache === "object") {
    total.cacheRead += t.cache.read || 0;
    total.cacheWrite += t.cache.write || 0;
  }
}

// billed = new (non-cache) tokens the provider charges for; cacheRead is reported
// separately and is identical across vanilla/trimmed when the prefix is untouched.
const billed = total.input + total.output + total.reasoning;
console.log(JSON.stringify({ messages, ...total, billedTokens: billed }, null, 2));

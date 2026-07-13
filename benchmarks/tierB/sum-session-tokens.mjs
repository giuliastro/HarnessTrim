// Sum token usage from an `opencode export <sessionID>` JSON dump. Walks the whole
// structure and accumulates every assistant `tokens` object it finds, so it is robust
// to the exact export shape. Usage: node sum-session-tokens.mjs <session.json>
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node sum-session-tokens.mjs <session.json>");
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const total = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
let messages = 0;

function isTokens(o) {
  return o && typeof o === "object" && typeof o.input === "number" && typeof o.output === "number";
}

function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === "object") {
    if (isTokens(v)) {
      messages++;
      total.input += v.input || 0;
      total.output += v.output || 0;
      total.reasoning += v.reasoning || 0;
      if (v.cache && typeof v.cache === "object") {
        total.cacheRead += v.cache.read || 0;
        total.cacheWrite += v.cache.write || 0;
      }
    }
    for (const val of Object.values(v)) walk(val);
  }
}

walk(data);

const billed = total.input + total.output + total.reasoning; // new (non-cache) tokens
console.log(
  JSON.stringify({ messages, ...total, billedTokens: billed }, null, 2)
);

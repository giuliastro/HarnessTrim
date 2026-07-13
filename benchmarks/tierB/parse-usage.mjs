// Defensively extract token usage + the assistant's final text from an `opencode run
// --format json` event stream (one JSON object per line). The exact usage event shape
// can vary by OpenCode version, so we scan every event for a tokens/usage object and
// keep the last one seen. Usage: node parse-usage.mjs <run.jsonl>
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node parse-usage.mjs <run.jsonl>");
  process.exit(2);
}

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);

let lastTokens = null;
let text = "";

function findTokens(obj) {
  // Return a {input,output,...} token object if this value looks like one.
  if (!obj || typeof obj !== "object") return null;
  const keys = Object.keys(obj);
  if (("input" in obj || "output" in obj) && keys.some((k) => typeof obj[k] === "number")) {
    return obj;
  }
  return null;
}

function walk(value) {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (value && typeof value === "object") {
    if ("tokens" in value) {
      const t = findTokens(value.tokens);
      if (t) lastTokens = t;
    }
    if ("usage" in value) {
      const t = findTokens(value.usage);
      if (t) lastTokens = t;
    }
    for (const v of Object.values(value)) walk(v);
  }
}

for (const line of lines) {
  let evt;
  try {
    evt = JSON.parse(line);
  } catch {
    continue;
  }
  walk(evt);
  if (evt.type === "text" && evt.part && typeof evt.part.text === "string") {
    text += evt.part.text;
  }
}

const result = {
  tokens: lastTokens,
  totalTokens: lastTokens
    ? Object.values(lastTokens).reduce((s, v) => (typeof v === "number" ? s + v : s), 0)
    : null,
  answerPreview: text.slice(0, 400),
};
console.log(JSON.stringify(result, null, 2));
if (!lastTokens) {
  console.error(`\n[parse-usage] No tokens/usage object found in ${file}. Inspect it manually — the event shape may have changed.`);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { genericTextSlim } from "./generic-text-slim.ts";

// Fixture: real cron output — OpenCode feature ideas report (head ~80 lines)
const featureIdeasOutput = `# Cron Job: OpenCode Remote Android daily feature ideas

**Job ID:** 8690174c2d8a
**Run Time:** 2026-07-15 18:17:12
**Schedule:** 15 18 * * *

## Prompt

This is a narrative paragraph that explains the context of the feature ideas.
It goes on for several lines describing the project status and current goals.
The model considers what has been accomplished and what remains to be done.
This is just filler prose that should be collapsed by the reducer.

### Current feature ideas

#### 1. 📱 Push notification per eventi sessione
**Perché ora**: API \`GET /event\` già disponibile con SSE. Aggiungere notifiche push lato mobile per eventi rilevanti (nuova sessione, modifica files, errori). Feature molto richiesta su GitHub.
**Primo passo** (2-3h): integrare Capacitor Push plugin + listener EventSource che traduce eventi in notifiche locali.

#### 2. 🔀 Fork/branch sessioni
**Perché ora**: API \`/session/:id/fork\` e \`/session/:id/children\` già documentate in OpenCode. Permette di creare una nuova sessione partendo dal contesto di una esistente.
**Primo passo** (1-2h): aggiungere \`api.forkSession()\` → \`POST /session/:id/fork\`.

#### 3. 🔍 Ricerca repository in-app
**Perché ora**: OpenCode espone \`GET /find\` (testo), \`/find/file\` (file), \`/find/symbol\` (simboli). Aggiungere una searchbar globale nella sidebar.
**Primo passo** (1-2h): aggiungere \`api.findText()\`, \`api.findFile()\`, \`api.findSymbol()\`.

#### 4. ⏪ Revert/unrevert modifiche
**Perché ora**: API \`POST /session/:id/revert\` e \`/unrevert\` già disponibili. Aggiungere bottoni nel detail.
**Primo passo** (1h): aggiungere \`api.revertSession()\` / \`api.unrevertSession()\`.

#### 5. 📝 Session summarize
**Perché ora**: API \`POST /session/:id/summarize\` restituisce un riassunto AI.
**Primo passo** (1h): aggiungere \`api.summarizeSession()\` + bottone nel detail.

This is trailing narrative that explains next steps and wraps up.
It discusses priorities and what to focus on in the next sprint.
Some final thoughts on implementation and potential blockers.`;

// Short output — nothing to collapse
const shortOutput = `# Quick status
Everything works fine.
No changes needed.`;

// Mixed output with only short prose runs
const mixedOutput = `## Status

OK.

## Next

Check later.`;

test("generic-text-slim: collapses long prose runs between features", () => {
  const result = genericTextSlim.reduce(featureIdeasOutput);
  assert.equal(result.changed, true);
  // Signal lines survive (headers, emoji bullets, bold markers)
  assert.match(result.output, /# Cron Job/);
  assert.match(result.output, /Current feature ideas/);
  assert.match(result.output, /📱 Push notification/);
  assert.match(result.output, /🔀 Fork\/branch sessioni/);
  assert.match(result.output, /🔍 Ricerca repository/);
  assert.match(result.output, /⏪ Revert\/unrevert/);
  assert.match(result.output, /📝 Session summarize/);
  // Collapse marker present
  assert.match(result.output, /omitted \d+ line\(s\) of prose\/narrative/);
  // First 2 lines kept (header metadata)
  assert.match(result.output, /\*\*Job ID:\*\*/);
  assert.match(result.output, /\*\*Run Time:\*\*/);
  // Last lines kept (trailing narrative conclusion)
  assert.match(result.output, /final thoughts/);
});

test("generic-text-slim: short output unchanged", () => {
  const result = genericTextSlim.reduce(shortOutput);
  assert.equal(result.changed, false);
  assert.equal(result.output, shortOutput);
});

test("generic-text-slim: mixed short runs unchanged", () => {
  const result = genericTextSlim.reduce(mixedOutput);
  assert.equal(result.changed, false);
  assert.equal(result.output, mixedOutput);
});

test("generic-text-slim: is idempotent", () => {
  const once = genericTextSlim.reduce(featureIdeasOutput).output;
  const twice = genericTextSlim.reduce(once).output;
  assert.equal(once, twice);
});

test("generic-text-slim: preserves code fences", () => {
  const input = `## Code

\`\`\`typescript
const x = 1;
const y = 2;
const z = 3;
\`\`\`

Some narrative text that goes on for a while without adding much value
and continues on the next line with more text that could be collapsed.
This is the third line of pure filler that should trigger a collapse.

## Next

\`\`\`
const a = 4;
\`\`\`
`;
  const result = genericTextSlim.reduce(input);
  assert.equal(result.changed, true);
  // Opening fence preserved
  assert.match(result.output, /```typescript/);
  assert.match(result.output, /const x = 1;/);
  assert.match(result.output, /const y = 2;/);
  assert.match(result.output, /const z = 3;/);
  // Closing fence preserved
  assert.match(result.output, /```\n/);
  // Second code block preserved
  assert.match(result.output, /const a = 4;/);
});

test("generic-text-slim: preserves tables", () => {
  const input = `## Stats

| Col1 | Col2 |
|------|------|
| A    | 1    |
| B    | 2    |

Some prose that should be collapsed if run is long enough.
More prose continuing the same thought for no good reason.
Third line of pure narrative filler.

## End

Done.
`;
  const result = genericTextSlim.reduce(input);
  assert.match(result.output, /\| Col1 \| Col2 \|/);
  assert.match(result.output, /\| A    \| 1    \|/);
});

test("generic-text-slim: keeps first and last CONTEXT_AFTER lines", () => {
  const input = `First line
Second line
Third line
Fourth line
Fifth line
## Middle
Sixth line
Seventh line
Eighth line
Ninth line`;
  const result = genericTextSlim.reduce(input);
  assert.match(result.output, /First line/);
  assert.match(result.output, /Second line/);
  // Last 2 lines kept (context_after = 2)
  assert.match(result.output, /Eighth line/);
  assert.match(result.output, /Ninth line/);
});

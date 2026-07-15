import { test } from "node:test";
import assert from "node:assert/strict";
import { fileListingSlim } from "./file-listing-slim.ts";

// Short ls output — unchanged
const shortLs = `total 12
drwxr-xr-x  2 user group  4096 Jul 15 10:00 .
drwxr-xr-x  5 user group  4096 Jul 15 09:00 ..
-rw-r--r--  1 user group   123 Jul 15 10:00 README.md`;

// Long ls output — should be collapsed
const longLsHeader = `total 4096
drwxr-xr-x  2 user group  4096 Jul 15 10:00 .
drwxr-xr-x  5 user group  4096 Jul 15 09:00 ..
-rw-r--r--  1 user group    45 Jul 15 10:00 .gitignore
-rw-r--r--  1 user group  1123 Jul 15 10:00 README.md
-rw-r--r--  1 user group  2345 Jul 15 10:01 index.ts`;
const longLsBody = Array.from(
  { length: 30 },
  (_, i) => `-rw-r--r--  1 user group   ${456 + i} Jul 15 10:0${i > 9 ? "0" : "1"} file-${i}.ts`,
).join("\n");
const longLs = `${longLsHeader}\n${longLsBody}\n${longLsBody}\n${longLsBody}`;

// find output
const findOutput = Array.from(
  { length: 25 },
  (_, i) => `./src/components/${i % 3 === 0 ? "ui" : "core"}/file-${i}.tsx`,
).join("\n");

// tree output
const treeOutput = `src/
├── components/
│   ├── App.tsx
│   ├── Header.tsx
│   └── Sidebar.tsx
├── utils/
│   ├── helpers.ts
│   └── constants.ts
└── index.ts`;

// search_files output
const searchFilesOutput = Array.from(
  { length: 20 },
  (_, i) => `src/file-${i}.ts:${i * 10 + 1}|const someVar${i} = ${i};`,
).join("\n");

// Non-file content — unchanged
const proseOutput = `This is just a normal text.
It has no file listings at all.
Just prose paragraphs that go on.
And nothing else here.`;

test("file-listing-slim: short ls output unchanged", () => {
  const result = fileListingSlim.reduce(shortLs);
  assert.equal(result.changed, false);
  assert.equal(result.output, shortLs);
});

test("file-listing-slim: collapses long ls output", () => {
  const result = fileListingSlim.reduce(longLs);
  assert.equal(result.changed, true);
  // Header preserved
  assert.match(result.output, /total 4096/);
  assert.match(result.output, /README.md/);
  // Collapse marker present
  assert.match(result.output, /\[harnesstrim:file-listing-slim\] omitted/);
});

test("file-listing-slim: collapses long find output", () => {
  const result = fileListingSlim.reduce(findOutput);
  assert.equal(result.changed, true);
  assert.match(result.output, /\[harnesstrim:file-listing-slim\] omitted/);
  // First and last entries preserved
  assert.match(result.output, /file-0\.tsx/);
  assert.match(result.output, /file-24\.tsx/);
});

test("file-listing-slim: short tree output unchanged", () => {
  const result = fileListingSlim.reduce(treeOutput);
  assert.equal(result.changed, false);
});

test("file-listing-slim: collapses long search_files output", () => {
  const result = fileListingSlim.reduce(searchFilesOutput);
  assert.equal(result.changed, true);
  assert.match(result.output, /\[harnesstrim:file-listing-slim\] omitted/);
});

test("file-listing-slim: prose unchanged", () => {
  const result = fileListingSlim.reduce(proseOutput);
  assert.equal(result.changed, false);
});

test("file-listing-slim: is idempotent", () => {
  const once = fileListingSlim.reduce(longLs).output;
  const twice = fileListingSlim.reduce(once).output;
  assert.equal(once, twice);
});

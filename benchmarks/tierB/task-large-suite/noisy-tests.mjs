// Deterministic "test suite" that prints a LARGE amount of mostly-passing, noisy output
// with a single failure, then exits non-zero. This is the high-volume counterpart to
// task-failing-test/noisy-tests.mjs: many suites × many tests => a big reducible tool
// output, so the blended session saving is dominated less by OpenCode's fixed cached
// system prompt. The agent is asked to run `npm test` and report the failing test name.
//
// Deterministic on purpose (no Math.random / Date.now): same bytes every run, so the
// vanilla-vs-trimmed comparison is controlled and the reducer stays idempotent.

const AREAS = [
  "auth", "users", "billing", "storage", "scheduler", "search", "notifications",
  "webhooks", "importer", "exporter", "analytics", "cache", "ratelimit", "audit",
  "migrations", "graphql", "rest", "grpc", "sessions", "featureflags",
];
const CASES = [
  "creates the record", "updates the record", "deletes the record", "lists with pagination",
  "filters by status", "sorts descending", "validates required fields", "rejects bad input",
  "handles empty results", "is idempotent on retry", "emits an audit event", "respects tenancy",
];

const FAILING = "handles concurrent writes without deadlock";

let n = 0;
for (const area of AREAS) {
  console.log(`PASS test/${area}.test.js`);
  for (const c of CASES) {
    n += 1;
    console.log(`  ok - ${c} (${1 + (n % 9)} ms)`);
  }
}

console.log(`FAIL test/storage.test.js`);
console.log(`  x - ${FAILING} (7 ms)`);
console.log(``);
console.log(`  ● storage > ${FAILING}`);
console.log(``);
console.log(`    Expected the second write to succeed after the lock was released.`);
console.log(`    Expected: "committed"`);
console.log(`    Received: "deadlock detected"`);
console.log(``);
console.log(`      at Object.<anonymous> (test/storage.test.js:84:22)`);
console.log(``);
console.log(`Test Suites: 1 failed, ${AREAS.length} passed, ${AREAS.length + 1} total`);
console.log(`Tests:       1 failed, ${n} passed, ${n + 1} total`);
console.log(`Time:        4.812 s`);

process.exit(1);

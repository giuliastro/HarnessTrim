// Deterministic "test suite" that prints mostly-passing, noisy output with a single
// failure, then exits non-zero. Used by the Tier B multi-step benchmark: the agent is
// asked to run three steps and report the failing test name. Most of this output is
// pure pass-noise that HarnessTrim's reducer collapses.
const suites = {
  "auth": ["logs in with valid credentials", "rejects invalid password", "expires idle sessions", "refreshes tokens", "logs out cleanly", "locks after failed attempts", "rotates api keys", "scopes tokens per role"],
  "users": ["creates a user", "updates email", "deletes a user", "paginates lists", "filters by role", "merges duplicate accounts", "exports to csv", "imports from csv"],
  "billing": ["creates an invoice", "applies a discount", "refunds fully", "refunds partially", "computes EU tax", "prorates mid-cycle", "handles currency conversion", "sends receipts"],
  "storage": ["writes a blob", "reads a blob", "lists a prefix", "deletes a blob"],
  "scheduler": ["enqueues a job", "runs on time", "retries on failure", "cancels a job", "dead-letters expired jobs"],
};

const FAILING = "handles concurrent writes without deadlock";

for (const [suite, tests] of Object.entries(suites)) {
  console.log(`PASS test/${suite}.test.js`);
  for (const t of tests) console.log(`  ok - ${t} (${1 + Math.round(0)} ms)`);
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
console.log(`Tests:       1 failed, 33 passed, 34 total`);
console.log(`Time:        3.412 s`);

process.exit(1);

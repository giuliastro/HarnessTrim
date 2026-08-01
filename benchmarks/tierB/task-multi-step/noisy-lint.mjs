// Deterministic "lint" step that prints a wall of pass/warn noise and exits 0.
// Second noisy tool-call in the multi-step benchmark.
const rules = ["no-console", "no-debugger", "prefer-const", "no-unused-vars", "eqeqeq", "no-empty", "consistent-return", "curly", "no-fallthrough"];
const files = ["src/auth.js", "src/users.js", "src/billing.js", "src/storage.js", "src/scheduler.js", "src/config.js", "src/db.js", "src/queue.js", "src/http.js", "src/ratelimit.js"];

for (const f of files) {
  for (const r of rules) {
    console.log(`${f}:${10 + (r.length % 40)}:${5 + (r.length % 30)}  warning  ${r} - line should match project style (auto-fixable)`);
  }
}
console.log(``);
console.log(`✖ ${files.length * rules.length} warnings`);
console.log(`  0 errors`);
console.log(`  20 files checked, 10 had style suggestions`);
console.log(`  Run eslint --fix to apply automatic fixes.`);

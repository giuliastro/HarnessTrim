import { test } from "node:test";
import assert from "node:assert/strict";
import { gitDiffSlim } from "./git-diff-slim.ts";

const mixedDiff = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 function foo() {
-  return 1;
+  return 2;
+  // added a comment
 }
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index 3333333..4444444 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -10,6 +10,9 @@ packages:
   dep-a:
     version: 1.0.0
+  dep-b:
+    version: 2.0.0
+  dep-c:
+    version: 3.0.0
   dep-d:
     version: 4.0.0
-  dep-e:
-    version: 5.0.0`;

test("git-diff-slim: leaves real source diffs untouched", () => {
  const result = gitDiffSlim.reduce(mixedDiff);
  assert.match(result.output, /diff --git a\/src\/foo\.ts b\/src\/foo\.ts/);
  assert.match(result.output, /-  return 1;/);
  assert.match(result.output, /\+  return 2;/);
});

test("git-diff-slim: collapses lockfile hunk into a summary line", () => {
  const result = gitDiffSlim.reduce(mixedDiff);
  assert.match(result.output, /diff --git a\/pnpm-lock\.yaml b\/pnpm-lock\.yaml/);
  assert.match(result.output, /pnpm-lock\.yaml: \+\d+ -\d+ \(generated\/lockfile, hunk omitted\)/);
  assert.doesNotMatch(result.output, /dep-b/);
  assert.equal(result.changed, true);
});

test("git-diff-slim: is idempotent", () => {
  const once = gitDiffSlim.reduce(mixedDiff).output;
  const twice = gitDiffSlim.reduce(once).output;
  assert.equal(once, twice);
});

test("git-diff-slim: no-op on diffs with no generated paths", () => {
  const sourceOnly = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 function foo() {
-  return 1;
+  return 2;
 }`;
  const result = gitDiffSlim.reduce(sourceOnly);
  assert.equal(result.changed, false);
  assert.equal(result.output, sourceOnly);
});

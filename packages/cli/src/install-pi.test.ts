import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInstallPi } from "./install-pi.ts";

test("runInstallPi --apply refreshes an existing project extension", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-pi-install-"));
  const first = runInstallPi(project, true);
  const extension = path.join(first.plan.extensionDest, "index.ts");
  fs.writeFileSync(extension, "stale extension");

  const refreshed = runInstallPi(project, true);

  assert.equal(refreshed.applied, true);
  assert.equal(fs.readFileSync(extension, "utf8"), fs.readFileSync(path.join(first.plan.extensionSource, "index.ts"), "utf8"));
});

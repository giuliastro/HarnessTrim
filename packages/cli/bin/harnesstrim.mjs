#!/usr/bin/env node

/**
 * Cross-platform executable entry point for the TypeScript CLI.
 *
 * `tsx` is a runtime dependency of this package, so this works after `pnpm exec`,
 * `pnpm link --global`, or a normal npm/pnpm installation on Linux, macOS, and
 * Windows without depending on the caller's working directory or shell.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliSource = resolve(__dirname, "..", "src", "cli.ts");
const tsxLoader = require.resolve("tsx");

const child = spawnSync(
  process.execPath,
  ["--import", tsxLoader, cliSource, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

if (child.error) {
  console.error(`Failed to start HarnessTrim CLI: ${child.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = child.status ?? 1;
}

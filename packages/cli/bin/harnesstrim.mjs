#!/usr/bin/env node
/**
 * HarnessTrim CLI — JS wrapper that runs the TypeScript entry point via tsx.
 *
 * tsx is resolved from this package's node_modules (listed as a dependency
 * of @harnesstrim/cli) so no global installation is needed.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const tsxCli = require.resolve("tsx/cli");
const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const result = spawnSync(
  process.execPath,
  [tsxCli, cliPath, ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env } },
);
process.exit(result.status ?? 1);

#!/usr/bin/env node

/**
 * HarnessTrim CLI — entry-point wrapper that bootstraps tsx for TypeScript.
 *
 * Strategy:
 *   1. Try resolving `tsx` from the workspace tree (monorepo dev).
 *   2. Fall back to the globally-installed `tsx`.
 *   3. Run the actual CLI source (`../src/cli.ts`) through tsx.
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find tsx: walk up the workspace tree, then check global / npx
function findTsx() {
  // Check sibling node_modules (packages/cli/node_modules)
  for (const scope of ["tsx", ".pnpm/tsx"]) {
    const candidates = [
      resolve(__dirname, "..", "node_modules", scope),
      resolve(__dirname, "..", "..", "..", "node_modules", scope),
    ];
    for (const p of candidates) {
      try {
        const req = createRequire(p);
        return req.resolve("tsx");
      } catch {
        // not found
      }
    }
  }
  // Check global via `which` / `where`
  try {
    execSync("which tsx", { stdio: "ignore" });
    return "tsx";
  } catch {
    // not found globally either
  }
  return null;
}

const tsxPath = findTsx();
const cliSource = resolve(__dirname, "..", "src", "cli.ts");

if (tsxPath) {
  // Load tsx and run via its Node.js API
  await import(tsxPath);
} else {
  // Fallback: try npx tsx
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    ["-e", `import("tsx").then(() => import(${JSON.stringify(cliSource)}))`],
    { stdio: "inherit" },
  );
  process.exitCode = child.exitCode ?? 1;
  return;
}

// Run the actual CLI
await import(cliSource);

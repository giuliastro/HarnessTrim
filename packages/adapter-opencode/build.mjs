import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(packageDir, "dist");

fs.mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [path.join(packageDir, "src", "plugin.ts")],
  outfile: path.join(distDir, "plugin.mjs"),
  bundle: true,
  alias: {
    "@harnesstrim/core": path.join(packageDir, "..", "core", "src", "index.ts"),
  },
  platform: "node",
  format: "esm",
  target: "node20",
});

console.log("[build] wrote dist/plugin.mjs");

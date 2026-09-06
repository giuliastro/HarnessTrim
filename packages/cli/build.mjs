// Build the publishable `harnesstrim` CLI: an ESM entry with lazy bundled chunks plus the data
// files the install commands read from disk.
//
//   dist/cli.mjs         <- esbuild bundle of src/cli.ts (all workspace + npm deps inlined)
//   assets/skills/       <- the shipped skill pack
//   assets/adapter-hermes/plugin/    <- the Hermes plugin bundle
//   assets/adapter-pi/extension/     <- the Pi extension bundle
//   assets/adapter-omp/hook/         <- the OMP hook bundle
//
// The bundle carries no runtime dependencies, so `npx harnesstrim` works
// standalone. assets.ts resolves these directories next to the bundle in a
// published build, falling back to the monorepo layout during development.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgDir, "..", "..");
const distDir = path.join(pkgDir, "dist");
const assetsDir = path.join(pkgDir, "assets");

/** Recursive copy, skipping build/VCS cruft that must never ship. */
const IGNORE = new Set(["__pycache__", ".installed", ".DS_Store"]);
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (IGNORE.has(entry.name) || entry.name.endsWith(".pyc")) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

// 1. Clean previous outputs.
fs.rmSync(distDir, { recursive: true, force: true });
fs.rmSync(assetsDir, { recursive: true, force: true });

// 2. Stage the data files beside the (soon-to-be) bundle.
copyDir(path.join(repoRoot, "skills"), path.join(assetsDir, "skills"));
copyDir(
  path.join(repoRoot, "packages", "adapter-hermes", "plugin"),
  path.join(assetsDir, "adapter-hermes", "plugin"),
);
copyDir(
  path.join(repoRoot, "packages", "adapter-pi", "extension"),
  path.join(assetsDir, "adapter-pi", "extension"),
);
copyDir(
  path.join(repoRoot, "packages", "adapter-omp", "hook"),
  path.join(assetsDir, "adapter-omp", "hook"),
);

// 3. Bundle. Everything is inlined (workspace packages are unpublished; js-tiktoken,
// the MCP SDK and zod are pulled in so the published package needs no dependencies).
const result = await build({
  metafile: true,
  entryPoints: [path.join(pkgDir, "src", "cli.ts")],
  outdir: distDir,
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // `bench` is a repo-development command: it reads the benchmark fixtures and
  // writes a report, and the benchmarks module auto-runs when its own URL matches
  // process.argv[1] — which is true for *any* entry once bundled. Keep it external
  // so importing it can't fire that guard. In a standalone install the dynamic
  // import fails and the CLI prints a dev-tool message (see the "bench" case in cli.ts).
  external: ["@harnesstrim/benchmarks/run"],
});

// The hook/pipe hot path must never eagerly parse token vocabularies or the MCP SDK.
// Check the static import graph, excluding dynamic imports, instead of flaky CI timing.
const initial = new Set();
const entryOutput = Object.keys(result.metafile.outputs).find((name) => name.endsWith("/cli.mjs"));
if (!entryOutput) throw new Error("CLI entry missing from build graph");
function visit(name) {
  if (initial.has(name)) return;
  initial.add(name);
  for (const item of result.metafile.outputs[name]?.imports ?? []) {
    if (!item.external && item.kind !== "dynamic-import") visit(item.path);
  }
}
visit(entryOutput);
const initialBytes = [...initial].reduce((sum, name) => sum + (result.metafile.outputs[name]?.bytes ?? 0), 0);
if (initialBytes > 256 * 1024) throw new Error(`CLI static startup graph exceeds 256 KiB: ${initialBytes}`);
console.log(`[build] initial static graph: ${initialBytes} bytes (budget 262144)`);

// esbuild also preserves the entry's own shebang; a duplicate #! on line 2 is a
// syntax error, so collapse the pair down to a single leading shebang.
const outFile = path.join(distDir, "cli.mjs");
let code = fs.readFileSync(outFile, "utf8");
code = code.replace(/^#!\/usr\/bin\/env node\n(#!\/usr\/bin\/env node\n)/, "$1");
fs.writeFileSync(outFile, code);

console.log("[build] wrote dist/cli.mjs and staged assets/");

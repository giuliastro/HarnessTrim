// Deterministic "dependency outdating" step that prints a large JSON blob (like
// `npm outdated --json`: one top-level key per package) and exits 0. Third noisy
// tool-call in the multi-step benchmark. jsonOutputSlim collapses it to the first
// 15 package keys.
const outdated = {};
for (const pkg of [
  "esbuild", "micromatch", "tar", "lodash", "axios", "minimist", "next", "zod",
  "crypto-js", "undici", "@types/node", "typescript", "eslint", "vitest", "prettier",
  "rollup", "tsup", "react", "react-dom", "tailwindcss", "postcss", "autoprefixer",
  "dotenv", "commander", "yargs", "semver", "uuid", "ws", "chokidar", "fast-glob",
]) {
  outdated[pkg] = {
    current: "1.2.3",
    wanted: "1.4.0",
    latest: "1.9.2",
    location: `node_modules/${pkg}`,
    type: pkg.startsWith("@") ? "devDependency" : "dependency",
    dependent: "tierb-task-multi-step",
  };
}

console.log(JSON.stringify(outdated, null, 2));
console.log(`[npm] checked 30 packages against registry in 841ms; 30 outdated`);

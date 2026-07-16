import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves data directories the install commands read from disk (the skill pack,
 * the Hermes plugin, the Pi extension). These files ship *beside the bundle* in a
 * published build but live in the monorepo layout during development.
 *
 * Two layouts, checked in order:
 *   1. **Published** — `esbuild` bundles the CLI to `<pkg>/dist/cli.mjs` and the
 *      build copies the data files to `<pkg>/assets/`. `import.meta.url` then points
 *      at the bundle, so assets sit at `<here>/../assets/<prodRel>`.
 *   2. **Dev** — running `src/*.ts` un-transpiled; `import.meta.url` points into
 *      `<repo>/packages/cli/src`, so the sources live at `<repo>/<devRel>`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

function resolveAssetDir(prodRel: string, devRel: string): string {
  // 1. Next to the bundle (prod), or a local build copy during dev.
  const bundled = path.resolve(here, "..", "assets", prodRel);
  if (fs.existsSync(bundled)) return bundled;
  // 2. Fall back to the monorepo layout (here = <repo>/packages/cli/src).
  return path.resolve(here, "..", "..", "..", devRel);
}

/** The shipped skill pack (six SKILL.md-bearing directories). */
export function resolveSkillsSourceDir(): string {
  return resolveAssetDir("skills", "skills");
}

/** The shipped Hermes plugin bundle (plugin.yaml + __init__.py). */
export function resolveHermesPluginSourceDir(): string {
  return resolveAssetDir(path.join("adapter-hermes", "plugin"), path.join("packages", "adapter-hermes", "plugin"));
}

/** The shipped Pi extension bundle (harnesstrim.ts). */
export function resolvePiExtensionSourceDir(): string {
  return resolveAssetDir(path.join("adapter-pi", "extension"), path.join("packages", "adapter-pi", "extension"));
}

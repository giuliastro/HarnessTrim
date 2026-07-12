import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planHermesInstall, markerFileContent, type HermesInstallPlan } from "@harnesstrim/adapter-hermes";

export interface HermesInstallResult {
  plan: HermesInstallPlan;
  applied: boolean;
  copiedFiles: string[];
}

/**
 * Locate the shipped Hermes plugin directory.  In the monorepo this resolves to
 * ``packages/adapter-hermes/plugin/`` (packages/cli/src/ -> repo root -> packages/adapter-hermes/plugin).
 */
function resolvePluginSourceDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "packages", "adapter-hermes", "plugin");
}

function pluginDirExists(pluginDest: string): boolean {
  try {
    return fs.statSync(pluginDest).isDirectory();
  } catch {
    return false;
  }
}

function markerPresent(pluginDest: string): boolean {
  try {
    return fs.statSync(path.join(pluginDest, ".installed")).isFile();
  } catch {
    return false;
  }
}

/**
 * Compute (and optionally apply) a Hermes plugin install: copy the shipped plugin
 * bundle into ``<installDir>/.hermes/plugins/harnesstrim/``.
 *
 * Dry-run by default (``apply=false``).  Idempotent via a ``.installed`` marker file.
 */
export function runInstallHermes(installDir: string, apply: boolean): HermesInstallResult {
  const pluginSourceDir = resolvePluginSourceDir();
  const pluginDest = path.join(installDir, ".hermes", "plugins", "harnesstrim");

  const plan = planHermesInstall({
    installDir,
    pluginSourceDir,
    pluginDirExists: pluginDirExists(pluginDest),
    markerPresent: markerPresent(pluginDest),
  });

  const copiedFiles: string[] = [];
  let applied = false;

  if (apply && !plan.alreadyInstalled) {
    fs.mkdirSync(pluginDest, { recursive: true });
    const entries = fs.readdirSync(pluginSourceDir, { withFileTypes: true });
    for (const entry of entries) {
      // Only copy files (skip subdirectories unless needed later)
      if (!entry.isDirectory()) {
        const src = path.join(pluginSourceDir, entry.name);
        const dst = path.join(pluginDest, entry.name);
        fs.copyFileSync(src, dst);
        copiedFiles.push(entry.name);
      }
    }
    // Write the .installed marker
    fs.writeFileSync(path.join(pluginDest, ".installed"), markerFileContent());
    copiedFiles.push(".installed");
    applied = true;
  }

  return { plan, applied, copiedFiles };
}

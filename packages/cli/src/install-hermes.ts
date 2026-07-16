import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HERMES_PLUGIN_NAME, markerFileContent, planHermesInstall, type HermesInstallPlan } from "@harnesstrim/adapter-hermes";
import { resolveHermesPluginSourceDir } from "./assets.ts";

export interface HermesInstallResult {
  plan: HermesInstallPlan;
  applied: boolean;
  copiedFiles: string[];
  /** Whether `hermes plugins enable harnesstrim` succeeded after installation. */
  enabled: boolean | null;
  /** Diagnostic when Hermes CLI is unavailable or enable failed. */
  enableMessage?: string;
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
 * Dry-run by default (``apply=false``). When applied, always refresh the shipped
 * plugin files so an existing installation receives reducer and bug-fix updates.
 */
export function runInstallHermes(installDir: string, apply: boolean): HermesInstallResult {
  const pluginSourceDir = resolveHermesPluginSourceDir();
  const pluginDest = path.join(installDir, ".hermes", "plugins", "harnesstrim");

  const plan = planHermesInstall({
    installDir,
    pluginSourceDir,
    pluginDirExists: pluginDirExists(pluginDest),
    markerPresent: markerPresent(pluginDest),
  });

  const copiedFiles: string[] = [];
  let applied = false;

  let enabled: boolean | null = null;
  let enableMessage: string | undefined;

  if (apply) {
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

    const enable = spawnSync("hermes", ["plugins", "enable", HERMES_PLUGIN_NAME], {
      encoding: "utf8",
    });
    if (enable.error) {
      enableMessage = "Hermes CLI was not available; enable harnesstrim after installing Hermes.";
    } else if (enable.status === 0) {
      enabled = true;
    } else {
      enabled = false;
      enableMessage = (enable.stderr || enable.stdout || "Hermes refused to enable the plugin.").trim();
    }
  }

  return { plan, applied, copiedFiles, enabled, enableMessage };
}

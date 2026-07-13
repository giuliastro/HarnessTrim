import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planPiInstall, markerFileContent, type PiInstallPlan } from "@harnesstrim/adapter-pi";

export interface PiInstallResult {
  plan: PiInstallPlan;
  applied: boolean;
  copiedFiles: string[];
}

/** Locate the shipped Pi extension dir (packages/cli/src -> repo root -> adapter-pi/extension). */
function resolveExtensionSourceDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "packages", "adapter-pi", "extension");
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function markerPresent(dest: string): boolean {
  try {
    return fs.statSync(path.join(dest, ".installed")).isFile();
  } catch {
    return false;
  }
}

/**
 * Compute (and optionally apply) a Pi install: copy the extension bundle into
 * `<installDir>/.pi/extensions/harnesstrim/`. Dry-run by default; idempotent via a
 * `.installed` marker.
 */
export function runInstallPi(installDir: string, apply: boolean): PiInstallResult {
  const extensionSourceDir = resolveExtensionSourceDir();
  const dest = path.join(installDir, ".pi", "extensions", "harnesstrim");

  const plan = planPiInstall({
    installDir,
    extensionSourceDir,
    extensionDirExists: dirExists(dest),
    markerPresent: markerPresent(dest),
  });

  const copiedFiles: string[] = [];
  let applied = false;
  if (apply && !plan.alreadyInstalled) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(extensionSourceDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        fs.copyFileSync(path.join(extensionSourceDir, entry.name), path.join(dest, entry.name));
        copiedFiles.push(entry.name);
      }
    }
    fs.writeFileSync(path.join(dest, ".installed"), markerFileContent());
    copiedFiles.push(".installed");
    applied = true;
  }

  return { plan, applied, copiedFiles };
}

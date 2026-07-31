import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { planPiInstall, markerFileContent, type PiInstallPlan } from "@harnesstrim/adapter-pi";
import { resolvePiExtensionSourceDir } from "./assets.ts";

export interface PiInstallResult {
  plan: PiInstallPlan;
  applied: boolean;
  copiedFiles: string[];
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
 * `<installDir>/.pi/extensions/harnesstrim/`. Dry-run by default; `--apply` is
 * safe to repeat and refreshes the installed extension bundle.
 */
export function runInstallPi(installDir: string, apply: boolean): PiInstallResult {
  const extensionSourceDir = resolvePiExtensionSourceDir();
  const scope = path.resolve(installDir) === path.resolve(os.homedir()) ? "user" : "project";
  const dest = scope === "user"
    ? path.join(installDir, ".pi", "agent", "extensions", "harnesstrim")
    : path.join(installDir, ".pi", "extensions", "harnesstrim");

  const plan = planPiInstall({
    installDir,
    extensionSourceDir,
    extensionDirExists: dirExists(dest),
    markerPresent: markerPresent(dest),
    scope,
  });

  const copiedFiles: string[] = [];
  let applied = false;
  if (apply) {
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

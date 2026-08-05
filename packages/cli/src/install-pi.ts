import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  planPiInstall,
  markerFileContent,
  resolvePiConfig,
  bakePiConfig,
  type PiAdapterConfig,
  type PiInstallPlan,
} from "@harnesstrim/adapter-pi";
import { resolvePiExtensionSourceDir } from "./assets.ts";

export interface PiInstallResult {
  plan: PiInstallPlan;
  applied: boolean;
  copiedFiles: string[];
  /** Absolute path of the baked config.json (mode/min-length/metrics). */
  configPath: string;
  /** The resolved adapter config written to config.json. */
  config: PiAdapterConfig;
}

export interface PiInstallOptions {
  /** Bake the reduction mode into config.json (dryrun/active/off). */
  mode?: PiAdapterConfig["mode"];
  /** Bake the minimum output length (chars) into config.json. */
  minLength?: number;
  /** Bake a TrimEvent JSONL receipt path so interception is verifiable. */
  metrics?: string;
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

/** Read the existing baked config (null when absent/unparseable). */
export function readPiConfigFile(configPath: string): Partial<PiAdapterConfig> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<PiAdapterConfig>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `<installDir>/.pi/extensions/harnesstrim/`. Dry-run by default; `--apply` is
 * safe to repeat and refreshes the installed extension bundle. The baked
 * config.json (mode/min-length/metrics) is preserved across refreshes unless
 * explicit options are passed, so a plain re-`--apply` never resets a baked
 * `--mode active`.
 */
export function runInstallPi(
  installDir: string,
  apply: boolean,
  options: PiInstallOptions = {}
): PiInstallResult {
  const extensionSourceDir = resolvePiExtensionSourceDir();
  const scope = path.resolve(installDir) === path.resolve(os.homedir()) ? "user" : "project";
  const dest = scope === "user"
    ? path.join(installDir, ".pi", "agent", "extensions", "harnesstrim")
    : path.join(installDir, ".pi", "extensions", "harnesstrim");
  const configPath = path.join(dest, "config.json");

  const existingConfig = readPiConfigFile(configPath);
  const config = resolvePiConfig(existingConfig, options);

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
    const sourceFiles = fs.readdirSync(extensionSourceDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    // Prune stale bundle files (e.g. a previous `harnesstrim.ts` entry) so the
    // installed dir always mirrors the shipped bundle. Never touch `.installed`
    // or `config.json` (user-baked state we own but must preserve).
    for (const existing of fs.readdirSync(dest)) {
      if (existing === ".installed" || existing === "config.json") continue;
      if (!sourceFiles.includes(existing)) {
        fs.rmSync(path.join(dest, existing), { recursive: true, force: true });
      }
    }
    for (const entry of sourceFiles) {
      fs.copyFileSync(path.join(extensionSourceDir, entry), path.join(dest, entry));
      copiedFiles.push(entry);
    }
    fs.writeFileSync(path.join(dest, ".installed"), markerFileContent());
    copiedFiles.push(".installed");
    // Bake the adapter state (mode/min-length/metrics) — always (re)written so the
    // file reflects the resolved config; content is unchanged when nothing changed.
    fs.writeFileSync(configPath, bakePiConfig(config));
    copiedFiles.push("config.json");
    applied = true;
  }

  return { plan, applied, copiedFiles, configPath, config };
}
import fs from "node:fs";
import path from "node:path";
import { extractPluginNames } from "./doctor.ts";

export const OPENCODE_PLUGIN_NAME = "@harnesstrim/adapter-opencode";

export interface InstallPlan {
  nextConfig: Record<string, unknown>;
  alreadyInstalled: boolean;
  changed: boolean;
}

/**
 * Pure: given a parsed opencode.json config (or null/{} for a fresh project),
 * return the config with the HarnessTrim plugin wired in, plus whether it was
 * already present. Preserves all other config keys and existing plugins.
 */
export function planOpencodeInstall(config: unknown): InstallPlan {
  const base: Record<string, unknown> =
    typeof config === "object" && config !== null ? { ...(config as Record<string, unknown>) } : {};
  const plugin = Array.isArray(base.plugin) ? [...(base.plugin as unknown[])] : [];
  const alreadyInstalled = extractPluginNames({ plugin }).some((n) => n.includes(OPENCODE_PLUGIN_NAME));
  if (alreadyInstalled) {
    return { nextConfig: { ...base, plugin }, alreadyInstalled: true, changed: false };
  }
  plugin.push(OPENCODE_PLUGIN_NAME);
  return { nextConfig: { ...base, plugin }, alreadyInstalled: false, changed: true };
}

export interface InstallResult extends InstallPlan {
  configPath: string;
  existed: boolean;
  applied: boolean;
}

/**
 * Compute (and optionally apply) the OpenCode install. Dry-run by default:
 * writes opencode.json only when `apply` is true and there's a change to make.
 */
export function runInstallOpencode(dir: string, apply: boolean): InstallResult {
  const configPath = path.join(dir, "opencode.json");
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    raw = null;
  }
  const existed = raw !== null;

  let config: unknown = {};
  if (raw !== null) {
    try {
      config = JSON.parse(raw);
    } catch {
      throw new Error(`${configPath} exists but is not valid JSON`);
    }
  }

  const plan = planOpencodeInstall(config);
  let applied = false;
  if (apply && plan.changed) {
    fs.writeFileSync(configPath, JSON.stringify(plan.nextConfig, null, 2) + "\n");
    applied = true;
  }
  return { configPath, existed, applied, ...plan };
}

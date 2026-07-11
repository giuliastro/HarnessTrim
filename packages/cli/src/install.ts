import fs from "node:fs";
import path from "node:path";
import { getPreset, type Preset } from "@harnesstrim/core";
import { extractPluginNames } from "./doctor.ts";

export const OPENCODE_PLUGIN_NAME = "@harnesstrim/adapter-opencode";

export interface InstallPlan {
  nextConfig: Record<string, unknown>;
  alreadyInstalled: boolean;
  changed: boolean;
}

function pluginIndex(plugin: unknown[]): number {
  return plugin.findIndex(
    (e) =>
      (typeof e === "string" && e.includes(OPENCODE_PLUGIN_NAME)) ||
      (Array.isArray(e) && typeof e[0] === "string" && e[0].includes(OPENCODE_PLUGIN_NAME))
  );
}

/**
 * Pure: given a parsed opencode.json config (or null/{} for a fresh project),
 * return the config with the HarnessTrim plugin wired in. When `adapterConfig` is
 * provided (from a preset), the plugin entry becomes a `[name, config]` tuple and
 * an existing entry is updated in place if its config differs. Preserves all other
 * config keys and existing plugins.
 */
export function planOpencodeInstall(config: unknown, adapterConfig?: Record<string, unknown>): InstallPlan {
  const base: Record<string, unknown> =
    typeof config === "object" && config !== null ? { ...(config as Record<string, unknown>) } : {};
  const plugin = Array.isArray(base.plugin) ? [...(base.plugin as unknown[])] : [];
  const desired: unknown = adapterConfig ? [OPENCODE_PLUGIN_NAME, adapterConfig] : OPENCODE_PLUGIN_NAME;

  const idx = pluginIndex(plugin);
  if (idx === -1) {
    plugin.push(desired);
    return { nextConfig: { ...base, plugin }, alreadyInstalled: false, changed: true };
  }

  // Already present. Only rewrite the entry if a preset config was requested and differs.
  if (adapterConfig && JSON.stringify(plugin[idx]) !== JSON.stringify(desired)) {
    plugin[idx] = desired;
    return { nextConfig: { ...base, plugin }, alreadyInstalled: true, changed: true };
  }
  return { nextConfig: { ...base, plugin }, alreadyInstalled: true, changed: false };
}

export interface InstallResult extends InstallPlan {
  configPath: string;
  existed: boolean;
  applied: boolean;
  preset?: Preset;
}

/**
 * Compute (and optionally apply) the OpenCode install. Dry-run by default. When
 * `presetName` is given, the preset's adapter config is baked into the plugin entry
 * and returned for the caller to surface its advisory parts (skills, effort).
 */
export function runInstallOpencode(dir: string, apply: boolean, presetName?: string): InstallResult {
  let preset: Preset | undefined;
  let adapterConfig: Record<string, unknown> | undefined;
  if (presetName) {
    preset = getPreset(presetName);
    if (!preset) throw new Error(`Unknown preset: ${presetName}`);
    adapterConfig = { ...preset.adapter };
  }

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

  const plan = planOpencodeInstall(config, adapterConfig);
  let applied = false;
  if (apply && plan.changed) {
    fs.writeFileSync(configPath, JSON.stringify(plan.nextConfig, null, 2) + "\n");
    applied = true;
  }
  return { configPath, existed, applied, preset, ...plan };
}

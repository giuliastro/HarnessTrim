import fs from "node:fs";
import path from "node:path";
import {
  planOmpInstall,
  resolveOmpConfig,
  bakeOmpConfig,
  OMP_HOOK_NAME,
  OMP_CONFIG_NAME,
  type OmpAdapterConfig,
  type OmpInstallPlan,
} from "@harnesstrim/adapter-omp";
import { resolveOmpHookSourceDir } from "./assets.ts";
import { scopeOf, ompHooksDir } from "./scope.ts";

export interface OmpInstallResult {
  plan: OmpInstallPlan;
  applied: boolean;
  copiedFiles: string[];
  /** Absolute path of the baked config.json (mode/min-length/metrics). */
  configPath: string;
  /** The resolved adapter config written to config.json. */
  config: OmpAdapterConfig;
}

export interface OmpInstallOptions {
  /** Bake the reduction mode into hooks/harnesstrim.json (dryrun/active/off). */
  mode?: OmpAdapterConfig["mode"];
  /** Bake the minimum output length (chars) into hooks/harnesstrim.json. */
  minLength?: number;
  /** Bake a TrimEvent JSONL receipt path so interception is verifiable. */
  metrics?: string;
}

/** Read the existing baked config (null when absent/unparseable). */
export function readOmpConfigFile(configPath: string): Partial<OmpAdapterConfig> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<OmpAdapterConfig>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Install the OMP tool_result hook: copy the shipped factory into the post hooks
 * dir (`~/.omp/agent/hooks/post/` for user scope, `.omp/hooks/post/` for project)
 * and bake mode/min-length/metrics into `harnesstrim.json` in the parent hooks dir
 * (outside `post/` so omp's loader never treats it as a hook file). Dry-run by
 * default; refresh-safe, and the baked config survives plain `--apply` re-runs.
 *
 * `home` overrides the directory that decides user vs project scope; it exists so tests
 * can pin a scope, and must stay in sync with what `planOmpUninstall` resolves.
 */
export function runInstallOmp(
  installDir: string,
  apply: boolean,
  options: OmpInstallOptions = {},
  home?: string
): OmpInstallResult {
  const hookSourceDir = resolveOmpHookSourceDir();
  const scope = scopeOf(installDir, home);
  const hooks = ompHooksDir(installDir, home);
  const hookDest = path.join(hooks, "post", OMP_HOOK_NAME);
  const configPath = path.join(hooks, OMP_CONFIG_NAME);

  const existingConfig = readOmpConfigFile(configPath);
  const config = resolveOmpConfig(existingConfig, options);

  const hookFileExists = fs.existsSync(hookDest);
  const hookContent = hookFileExists ? fs.readFileSync(hookDest, "utf8") : null;

  const plan = planOmpInstall({
    installDir,
    hookSourceDir,
    hookFileExists,
    hookContent,
    scope,
  });

  const copiedFiles: string[] = [];
  let applied = false;
  if (apply) {
    fs.mkdirSync(path.dirname(hookDest), { recursive: true });
    fs.copyFileSync(path.join(hookSourceDir, OMP_HOOK_NAME), hookDest);
    copiedFiles.push(path.join("post", OMP_HOOK_NAME));
    fs.writeFileSync(configPath, bakeOmpConfig(config));
    copiedFiles.push(OMP_CONFIG_NAME);
    applied = true;
  }

  return { plan, applied, copiedFiles, configPath, config };
}
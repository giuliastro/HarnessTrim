import path from "node:path";

/**
 * HarnessTrim adapter for Hermes Agent.
 *
 * Hermes has a plugin system with a ``transform_tool_result`` hook that fires
 * after every tool call and before the result enters the model's context.
 * This adapter:
 *   1. copies the Python plugin files (plugin.yaml + __init__.py) into
 *      `~/.hermes/plugins/harnesstrim/` (or `<project>/.hermes/plugins/harnesstrim/`),
 *   2. optionally appends a doctor hook to detect waste on the Hermes side,
 *   3. documents the mode/dryrun lifecycle in the README.
 *
 * The planner is pure (takes the current plugin directory state); a runner in the CLI
 * performs the file IO.
 */

export const HERMES_PLUGIN_NAME = "harnesstrim";
export const HERMES_PLUGIN_MARKER = "harnesstrim:plugin-ready";

export interface SkillCopy {
  name: string;
  from: string;
  to: string;
  present: boolean;
}

export interface HermesInstallPlan {
  /** Destination directory for the plugin bundle (e.g. ~/.hermes/plugins/harnesstrim/). */
  pluginDest: string;
  /** Source directory of the shipped plugin bundle. */
  pluginSource: string;
  /** Whether the plugin is already present at the destination. */
  alreadyInstalled: boolean;
}

export interface HermesInstallInput {
  /** Target installation directory (project dir or user home). */
  installDir: string;
  /** Directory the shipped plugin is read from (packages/adapter-hermes/plugin/). */
  pluginSourceDir: string;
  /** Whether the plugin directory already exists at the destination. */
  pluginDirExists: boolean;
  /** Whether the marker file inside the plugin dir indicates a prior install. */
  markerPresent: boolean;
}

/**
 * Compute what a Hermes install would do. Pure — no filesystem access.
 * The plugin is considered already installed if the plugin dir exists AND
 * the marker file is present (idempotent).
 */
export function planHermesInstall(input: HermesInstallInput): HermesInstallPlan {
  const pluginDest = path.join(input.installDir, ".hermes", "plugins", HERMES_PLUGIN_NAME);
  const alreadyInstalled = input.pluginDirExists && input.markerPresent;

  return {
    pluginDest,
    pluginSource: input.pluginSourceDir,
    alreadyInstalled,
  };
}

/**
 * Content of the marker file placed inside the plugin directory to detect
 * prior installations across runs.
 */
export function markerFileContent(): string {
  return [
    `# harnesstrim:plugin-ready`,
    ``,
    `This marker file indicates the HarnessTrim reducer plugin was installed`,
    `by \`harnesstrim install hermes --apply\`. The plugin can be enabled/disabled`,
    `via 'plugins.enabled' in Hermes' config.yaml.`,
    ``,
  ].join("\n");
}

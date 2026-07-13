import path from "node:path";

/**
 * HarnessTrim adapter for Pi (@earendil-works/pi-coding-agent).
 *
 * Pi loads TypeScript extensions from `~/.pi/agent/extensions/` (global) or
 * `<project>/.pi/extensions/` (project-local). Our extension (`extension/harnesstrim.ts`)
 * registers a `tool_result` handler that slims noisy tool output before it reaches the
 * model — Pi's deterministic tool-output hook, analogous to OpenCode's `tool.execute.after`.
 *
 * The planner is pure (takes the current extension-dir state); a runner in the CLI copies
 * the extension bundle and writes an `.installed` marker for idempotency.
 */
export const PI_EXTENSION_NAME = "harnesstrim";

export interface PiInstallPlan {
  /** Destination dir for the extension bundle (e.g. <project>/.pi/extensions/harnesstrim/). */
  extensionDest: string;
  /** Source dir of the shipped extension bundle. */
  extensionSource: string;
  /** True if the extension dir exists AND its marker is present (idempotent). */
  alreadyInstalled: boolean;
}

export interface PiInstallInput {
  /** Target install dir (project root, or the user's home for a global install). */
  installDir: string;
  /** Directory the shipped extension is read from (packages/adapter-pi/extension/). */
  extensionSourceDir: string;
  /** Whether the extension dir already exists at the destination. */
  extensionDirExists: boolean;
  /** Whether the `.installed` marker inside the extension dir indicates a prior install. */
  markerPresent: boolean;
}

/**
 * Compute what a Pi install would do. Pure — no filesystem access. The extension is
 * considered already installed when its dir exists and the marker is present.
 */
export function planPiInstall(input: PiInstallInput): PiInstallPlan {
  const extensionDest = path.join(input.installDir, ".pi", "extensions", PI_EXTENSION_NAME);
  return {
    extensionDest,
    extensionSource: input.extensionSourceDir,
    alreadyInstalled: input.extensionDirExists && input.markerPresent,
  };
}

/** Content of the `.installed` marker written inside the extension dir. */
export function markerFileContent(): string {
  return [
    `# harnesstrim:pi-extension`,
    ``,
    `Installed by \`harnesstrim install pi --apply\`. The extension registers a`,
    `tool_result handler that slims noisy tool output. Set HARNESSTRIM_MODE=active in`,
    `Pi's environment to reduce (default is dryrun). Remove this directory to uninstall.`,
    ``,
  ].join("\n");
}

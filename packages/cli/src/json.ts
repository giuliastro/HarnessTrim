import type { DoctorReport } from "./doctor.ts";
import type { MetricsResult } from "./metrics.ts";
import type { InstallResult } from "./install.ts";
import type { CodexGlobalHookInstallResult, CodexInstallResult } from "./install-codex.ts";
import type { ClaudeInstallResult } from "./install-claude.ts";
import type { PiInstallResult } from "./install-pi.ts";
import type { HermesInstallResult } from "./install-hermes.ts";

/**
 * Machine-readable CLI output (the `--json` flag). Every command that accepts `--json`
 * prints exactly ONE JSON object to stdout; human rendering stays the default.
 * No JSON library is pulled in — `JSON.stringify` on plain data (zero runtime deps).
 */

export interface JsonAction {
  type: "copy" | "write" | "append" | "clean" | "run" | "none";
  /** Target path the action applies to (absolute). */
  path: string;
  /** Present only when the action is "copy". */
  from?: string;
  /** Human-readable note about the action (e.g. what would be written). */
  note?: string;
}

export interface JsonInstallPlan {
  harness: string;
  dryRun: boolean;
  changed: boolean;
  alreadyInstalled: boolean;
  applied: boolean;
  actions: JsonAction[];
  /** Extra per-harness facts (preset name, hook presence, ...). */
  details?: Record<string, unknown>;
}

export function doctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

export function metricsJson(result: MetricsResult): string {
  return JSON.stringify(result, null, 2);
}

export function opencodeInstallJson(result: InstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = [];
  if (result.changed) {
    actions.push(
      {
        type: "write",
        path: result.wrapperPath,
        note: "local plugin wrapper with the adapter options",
      },
      {
        type: "write",
        path: result.packageJsonPath,
        note: "declares @harnesstrim/adapter-opencode",
      }
    );
    if (result.opencodeJsonContent !== null) {
      actions.push({
        type: "clean",
        path: result.opencodeJsonPath,
        note: "remove the stale adapter entry (options live in the wrapper now)",
      });
    }
  }
  return {
    harness: "opencode",
    dryRun: !apply,
    changed: result.changed,
    alreadyInstalled: result.alreadyInstalled,
    applied: result.applied,
    actions,
    details: {
      preset: result.preset?.name ?? null,
      depsInstalled: result.depsInstalled,
      depsMessage: result.depsMessage ?? null,
    },
  };
}

export function codexInstallJson(result: CodexInstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = result.plan.skills.map((s) => ({
    type: s.present ? "none" : "copy",
    path: s.to,
    from: s.from,
    note: s.present ? "already present" : "copy skill",
  }));
  if (result.plan.instructionsAction !== "present") {
    actions.push({
      type: result.plan.instructionsAction === "create" ? "write" : "append",
      path: result.plan.instructionsFile,
      note: `reduce-pipe instruction (${result.plan.instructionsAction})`,
    });
  }
  if (result.hookPlan && result.hookPlan.action !== "present") {
    actions.push({
      type: "write",
      path: result.hookPlan.hooksFile,
      note: `Bash PostToolUse hook (${result.hookPlan.action})`,
    });
  }
  const hookChanged = result.hookPlan !== null && result.hookPlan.action !== "present";
  return {
    harness: "codex",
    dryRun: !apply,
    changed: result.plan.changed || hookChanged,
    alreadyInstalled: !result.plan.changed && !hookChanged,
    applied: result.applied,
    actions,
    details: { hook: result.hookPlan ? result.hookPlan.action : "skipped" },
  };
}

export function claudeInstallJson(result: ClaudeInstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = result.plan.skills.map((s) => ({
    type: s.present ? "none" : "copy",
    path: s.to,
    from: s.from,
    note: s.present ? "already present" : "copy skill",
  }));
  if (result.plan.settingsAction !== "present") {
    actions.push({
      type: result.plan.settingsAction === "create" ? "write" : "write",
      path: result.plan.settingsFile,
      note: `PostToolUse Bash hook (${result.plan.settingsAction})`,
    });
  }
  if (result.plan.instructionsAction !== "present") {
    actions.push({
      type: result.plan.instructionsAction === "create" ? "write" : "append",
      path: result.plan.instructionsFile,
      note: `reduce-pipe instruction (${result.plan.instructionsAction})`,
    });
  }
  return {
    harness: "claude",
    dryRun: !apply,
    changed: result.plan.changed,
    alreadyInstalled: !result.plan.changed,
    applied: result.applied,
    actions,
    details: {
      settingsAction: result.plan.settingsAction,
      instructionsAction: result.plan.instructionsAction,
    },
  };
}

export function hermesInstallJson(result: HermesInstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = [
    {
      type: result.plan.alreadyInstalled ? "none" : "copy",
      path: result.plan.pluginDest,
      from: result.plan.pluginSource,
      note: result.plan.alreadyInstalled ? "already installed" : "copy Hermes plugin bundle",
    },
  ];
  return {
    harness: "hermes",
    dryRun: !apply,
    changed: !result.plan.alreadyInstalled,
    alreadyInstalled: result.plan.alreadyInstalled,
    applied: result.applied,
    actions,
    details: { enabled: result.enabled, enableMessage: result.enableMessage ?? null },
  };
}

export function piInstallJson(result: PiInstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = [
    {
      type: result.plan.alreadyInstalled ? "none" : "copy",
      path: result.plan.extensionDest,
      from: result.plan.extensionSource,
      note: result.plan.alreadyInstalled ? "already installed" : "copy Pi extension bundle",
    },
  ];
  return {
    harness: "pi",
    dryRun: !apply,
    changed: !result.plan.alreadyInstalled,
    alreadyInstalled: result.plan.alreadyInstalled,
    applied: result.applied,
    actions,
  };
}

export function codexGlobalHookJson(result: CodexGlobalHookInstallResult, apply: boolean): JsonInstallPlan {
  const actions: JsonAction[] = [
    {
      type: result.hookPlan.action === "present" ? "none" : "write",
      path: result.hookPlan.hooksFile,
      note: `global Bash PostToolUse hook (${result.hookPlan.action})`,
    },
  ];
  return {
    harness: "codex",
    dryRun: !apply,
    changed: result.hookPlan.action !== "present",
    alreadyInstalled: result.hookPlan.action === "present",
    applied: result.applied,
    actions,
    details: { scope: "global" },
  };
}

import type { Preset } from "@harnesstrim/core";
import type { DoctorReport, Severity } from "./doctor.ts";
import type { InstallResult } from "./install.ts";
import type { MetricsResult } from "./metrics.ts";
import type { CodexGlobalHookInstallResult, CodexInstallResult } from "./install-codex.ts";
import type { ClaudeInstallResult } from "./install-claude.ts";
import type { PiInstallResult } from "./install-pi.ts";
import type { HermesInstallResult } from "./install-hermes.ts";
import type { OmpInstallResult } from "./install-omp.ts";
import type { UninstallResult } from "./uninstall.ts";

const ICON: Record<Severity, string> = { warn: "!", info: "i", ok: "+" };

export function renderDoctor(report: DoctorReport): string {
  const lines: string[] = [`harnesstrim doctor — ${report.dir}`, ""];
  for (const f of report.findings) {
    lines.push(`[${ICON[f.severity]}] ${f.title}`);
    lines.push(`    ${f.detail}`);
    if (f.suggestion) lines.push(`    → ${f.suggestion}`);
  }
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  lines.push("");
  lines.push(warns > 0 ? `${warns} issue(s) worth addressing.` : "No issues found.");
  return lines.join("\n");
}

export function renderInstall(result: InstallResult, apply: boolean): string {
  const lines: string[] = [];
  const wrapper = result.wrapperPath;
  const pkg = result.packageJsonPath;

  if (!result.changed) {
    lines.push(`Already installed and up to date: ${wrapper} loads the HarnessTrim adapter.`);
    if (result.preset) {
      lines.push("");
      lines.push(renderPresetAdvisory(result.preset));
    }
    return lines.join("\n");
  }

  if (apply) {
    lines.push(`Installed the OpenCode adapter as a local plugin:`);
    lines.push(`  • wrote ${wrapper} (auto-loaded by OpenCode from .opencode/plugin/)`);
    lines.push(`  • wrote ${pkg} (declares @harnesstrim/adapter-opencode)`);
    if (result.opencodeJsonContent !== null) {
      lines.push(`  • cleaned the adapter entry out of ${result.opencodeJsonPath} (options live in the wrapper now)`);
    }
    if (result.depsInstalled === true) lines.push(`  • installed the .opencode dependency`);
    else if (result.depsInstalled === false) lines.push(`  ! ${result.depsMessage}`);
    lines.push("");
    lines.push("Reduction is active; telemetry writes to .harnesstrim/metrics.jsonl.");
    lines.push("Reload OpenCode so it loads the plugin, then check `harnesstrim metrics`.");
  } else {
    lines.push(`Dry run — no files changed. \`--apply\` would:`);
    lines.push(`  • write ${wrapper} (local plugin wrapper with the adapter options)`);
    lines.push(`  • write ${pkg} (declare @harnesstrim/adapter-opencode) and install it`);
    if (result.opencodeJsonContent !== null) {
      lines.push(`  • remove the stale adapter entry from ${result.opencodeJsonPath}`);
    }
    lines.push("");
    lines.push("OpenCode's `plugin` config can't pass options, so the adapter is installed as a");
    lines.push("local plugin file instead. Re-run with `--apply` to write it.");
  }
  if (result.preset) {
    lines.push("");
    lines.push(renderPresetAdvisory(result.preset));
  }
  return lines.join("\n");
}

/** The parts of a preset the adapter config can't enforce yet — surfaced as guidance. */
function renderPresetAdvisory(preset: Preset): string {
  return [
    `Preset "${preset.name}" also recommends (not auto-applied):`,
    `  - enable skills: ${preset.skills.join(", ")}`,
    `  - reasoning effort: ${preset.reasoningEffort}`,
    `  - ${preset.notes}`,
  ].join("\n");
}

export function renderPresetList(presets: Preset[]): string {
  const lines = ["Available presets:", ""];
  for (const p of presets) {
    lines.push(`  ${p.name.padEnd(20)} ${p.description}`);
  }
  lines.push("");
  lines.push("Show one with: harnesstrim preset show <name>");
  return lines.join("\n");
}

export function renderPresetShow(preset: Preset): string {
  return [
    `Preset: ${preset.name}`,
    preset.description,
    "",
    "Adapter config (enforced on install --preset):",
    JSON.stringify(preset.adapter, null, 2),
    "",
    `Recommended skills: ${preset.skills.join(", ")}`,
    `Reasoning effort:   ${preset.reasoningEffort}`,
    "",
    preset.notes,
  ].join("\n");
}

export function renderCodexInstall(result: CodexInstallResult, apply: boolean): string {
  const { plan } = result;
  const lines: string[] = [];
  const verb = apply ? "Installed" : "Would install";
  lines.push(`${verb} Codex integration in ${plan.instructionsFile.replace(/AGENTS\.md$/, "")}`.trimEnd());
  lines.push("");

  lines.push(`Skills -> ${plan.skillsDest}`);
  for (const s of plan.skills) {
    const state = s.present ? "already present" : apply ? "copied" : "would copy";
    lines.push(`  ${s.name.padEnd(18)} ${state}`);
  }
  lines.push("");

  const instr =
    plan.instructionsAction === "skip"
      ? "AGENTS.md instruction skipped (--no-instructions); skills only."
      : plan.instructionsAction === "present"
        ? "AGENTS.md already contains the HarnessTrim instruction (no change)."
        : plan.instructionsAction === "create"
          ? `AGENTS.md ${apply ? "created" : "would be created"} with the reduce-pipe instruction.`
          : `Reduce-pipe instruction ${apply ? "appended" : "would be appended"} to AGENTS.md.`;
  lines.push(instr);

  if (result.hookPlan) {
    lines.push("");
    if (result.hookPlan.action === "present") {
      lines.push(`${result.hookPlan.hooksFile}: HarnessTrim Bash PostToolUse hook already present (no change).`);
    } else {
      lines.push(
        `${result.hookPlan.hooksFile}: experimental Bash PostToolUse hook ${apply ? (result.hookPlan.action === "create" ? "created" : "added") : "would be added"}.`
      );
      lines.push("It reduces simple Bash output automatically and records JSONL telemetry in .harnesstrim/metrics.jsonl.");
      if (!apply) {
        lines.push("Resulting hooks.json:");
        lines.push(JSON.stringify(result.hookPlan.nextHooks, null, 2));
      }
    }
  }

  if (!apply) {
    lines.push("");
    lines.push("Dry run — nothing written. Re-run with `--apply`.");
  }
  return lines.join("\n");
}

export function renderCodexGlobalHookInstall(result: CodexGlobalHookInstallResult, apply: boolean): string {
  const lines = [`${apply ? "Installed" : "Would install"} global Codex Bash PostToolUse hook`, ""];
  if (result.hookPlan.action === "present") {
    lines.push(`${result.hookPlan.hooksFile}: HarnessTrim hook already present (no change).`);
  } else {
    lines.push(`${result.hookPlan.hooksFile}: experimental Bash PostToolUse hook ${apply ? (result.hookPlan.action === "create" ? "created" : "added") : "would be added"}.`);
    lines.push("It applies in trusted projects and writes telemetry to each project's .harnesstrim/metrics.jsonl.");
    if (!apply) {
      lines.push("Resulting hooks.json:");
      lines.push(JSON.stringify(result.hookPlan.nextHooks, null, 2));
    }
  }
  if (!apply) lines.push("", "Dry run — nothing written. Re-run with `--apply`.");
  return lines.join("\n");
}

export function renderClaudeInstall(result: ClaudeInstallResult, apply: boolean): string {
  const { plan } = result;
  const lines: string[] = [];
  lines.push(`${apply ? "Installed" : "Would install"} Claude Code integration`);
  lines.push("");

  lines.push(`Skills -> ${plan.skillsDest}`);
  for (const s of plan.skills) {
    const state = s.present ? "already present" : apply ? "copied" : "would copy";
    lines.push(`  ${s.name.padEnd(18)} ${state}`);
  }
  lines.push("");

  if (plan.settingsAction === "skip") {
    lines.push(`${plan.settingsFile}: PostToolUse hook skipped (--no-hook); skills only.`);
  } else if (plan.settingsAction === "present") {
    lines.push(`${plan.settingsFile}: PostToolUse reducer hook already present (no change).`);
  } else {
    lines.push(
      `${plan.settingsFile}: PostToolUse hook (matcher Bash) ${apply ? (plan.settingsAction === "create" ? "created" : "added") : "would be added"}.`
    );
    if (!apply) {
      lines.push("");
      lines.push("Resulting settings.json:");
      lines.push(JSON.stringify(plan.nextSettings, null, 2));
    }
  }
  lines.push("");
  if (plan.instructionsAction === "skip") {
    lines.push(`${plan.instructionsFile}: reduce-pipe instruction skipped (--no-instructions); skills only.`);
  } else if (plan.instructionsAction === "present") {
    lines.push(`${plan.instructionsFile}: reduce-pipe instruction already present (no change).`);
  } else {
    lines.push(
      `${plan.instructionsFile}: reduce-pipe instruction ${apply ? (plan.instructionsAction === "create" ? "created" : "appended") : "would be added"}.`
    );
  }
  lines.push("");
  lines.push("Note: `harnesstrim` must be on PATH (used by both the hook and the reduce pipe).");
  lines.push(
    "The CLAUDE.md instruction is the effective path today: current Claude Code versions don't apply"
  );
  lines.push("the hook's updatedToolOutput, so piping through `harnesstrim reduce` is what saves tokens.");
  if (!apply) lines.push("Dry run — nothing written. Re-run with `--apply`.");
  return lines.join("\n");
}

export function renderHermesInstall(result: HermesInstallResult, apply: boolean): string {
  const { plan } = result;
  const lines: string[] = [];
  lines.push(`${apply ? "Installed" : "Would install"} Hermes Agent plugin`);
  lines.push("");

  lines.push(`Plugin -> ${plan.pluginDest}`);
  if (apply) {
    lines.push(`  ${plan.alreadyInstalled ? "Refreshed" : "Copied"}: ${result.copiedFiles.join(", ")}`);
    if (result.enabled === true) {
      lines.push("  Enabled: harnesstrim");
    } else if (result.enableMessage) {
      lines.push(`  Enable manually: ${result.enableMessage}`);
    }
    lines.push("");
    lines.push(`  Baked config -> ${result.configPath} (mode ${result.config.mode}, min-length ${result.config.minLength})`);
    // Distinguish "recognized on disk" from "loaded by the running gateway". Hermes
    // loads plugin bundles at gateway startup, so a fresh bundle is only active after
    // the gateway process restarts — and a gateway must not replace itself from inside
    // an active agent turn (Hermes self-restart protection, systemd-managed instances).
    if (result.pluginListed === true) {
      lines.push("  Hermes CLI sees the plugin on disk (hermes plugins list).");
      lines.push("  The RUNNING gateway still uses the previous bundle until it is restarted.");
    } else if (result.pluginListed === null) {
      lines.push("  Could not verify via `hermes plugins list` (CLI unavailable or ran from inside the gateway).");
    }
    lines.push("  Reload: run `hermes gateway restart` from a shell OUTSIDE the gateway.");
    lines.push("  (or for systemd instances: `systemctl --user restart hermes-gateway`); a reload");
    lines.push("  may be deferred to the supervisor after the current run.");
  } else {
    lines.push(`  Source: ${plan.pluginSource}`);
    lines.push(`  Dest:   ${plan.pluginDest}`);
    lines.push("  (plugin.yaml + __init__.py + config.json; plugin will be enabled on --apply when Hermes CLI is available)");
  }

  if (!apply) {
    lines.push("");
    lines.push("Dry run — nothing written. Re-run with `--apply`.");
  }
  return lines.join("\n");
}

export function renderPiInstall(result: PiInstallResult, apply: boolean): string {
  const { plan } = result;
  const lines: string[] = [];
  lines.push(`${apply ? "Installed" : "Would install"} Pi extension`);
  lines.push("");

  if (plan.alreadyInstalled && !apply) {
    lines.push(`Pi extension already installed at ${plan.extensionDest} (no change).`);
  } else {
    lines.push(`Extension -> ${plan.extensionDest}`);
    if (apply) {
      lines.push(`  Copied: ${result.copiedFiles.join(", ")}`);
    } else {
      lines.push(`  Source: ${plan.extensionSource}`);
      lines.push("  (index.ts + .installed marker + config.json)");
    }
    lines.push("");
    lines.push("The extension hooks Pi's `tool_result` and needs `harnesstrim` on PATH.");
  }
  lines.push(`  Baked config -> ${result.configPath} (mode ${result.config.mode}, min-length ${result.config.minLength}${result.config.metrics ? `, metrics ${result.config.metrics}` : ""})`);

  if (!apply) {
    lines.push("");
    lines.push("Dry run — nothing written. Re-run with `--apply`.");
  }
  return lines.join("\n");
}

export function renderOmpInstall(result: OmpInstallResult, apply: boolean): string {
  const { plan } = result;
  const lines: string[] = [];
  lines.push(`${apply ? "Installed" : "Would install"} OMP tool_result hook`);
  lines.push("");

  if (plan.alreadyInstalled) {
    lines.push(`OMP hook already installed at ${plan.hookDest} (no change).`);
  } else {
    lines.push(`Hook -> ${plan.hookDest}`);
    if (apply) {
      lines.push(`  Copied: ${result.copiedFiles.join(", ")}`);
    } else {
      lines.push(`  Source: ${plan.hookSource}`);
      lines.push("  (harnesstrim.ts factory in hooks/post/ — discovered and loaded by omp with no");
      lines.push("   settings.json entry and no trust gate)");
    }
  }
  lines.push(`  Config -> ${plan.configDest} (mode ${result.config.mode}, min-length ${result.config.minLength}${result.config.metrics ? `, metrics ${result.config.metrics}` : ""})`);
  lines.push("  The hook reduces text tool results via `harnesstrim reduce` and needs `harnesstrim` on PATH.");

  if (!apply) {
    lines.push("");
    lines.push("Dry run — nothing written. Re-run with `--apply`.");
  }
  return lines.join("\n");
}

export function renderMetrics(result: MetricsResult): string {
  if (!result.found) {
    return `No telemetry found at ${result.path}.\nEnable it in the adapter (telemetry: true) to record reductions.`;
  }
  const s = result.summary;
  if (s.events === 0) {
    return `${result.path}: 0 reductions recorded yet.`;
  }
  const lines = [
    `harnesstrim metrics — ${result.path}`,
    "",
    `Attempts:     ${s.events} (${s.reduced} reduced, ${s.passThrough} pass-through, ${s.reductionErrors} error)`,
    `Pass-through: ${s.passThroughRate}% of attempts unchanged`,
    `Chars:        ${s.beforeChars} -> ${s.afterChars}  (saved ${s.savedChars}, -${s.reductionPct}%)`,
  ];
  if (s.reductionErrors > 0) {
    lines.push(`Reduction errors: ${s.reductionErrors} attempt(s) GREW the output (+${s.grewChars} chars) — investigate`);
  }
  lines.push("");
  lines.push("By reducer:");
  for (const b of s.byReducer) {
    const p = b.beforeChars === 0 ? 0 : Math.round((b.savedChars / b.beforeChars) * 1000) / 10;
    lines.push(`  ${b.reducer.padEnd(20)} ${b.count}x  saved ${b.savedChars} chars (-${p}%)`);
  }
  if (s.byHarness.length > 0) {
    lines.push("");
    lines.push("By harness:");
    for (const h of s.byHarness) {
      const p = h.beforeChars === 0 ? 0 : Math.round((h.savedChars / h.beforeChars) * 1000) / 10;
      const sign = p < 0 ? "" : "-";
      lines.push(`  ${h.harness.padEnd(12)} ${h.count}x  saved ${h.savedChars} chars (${sign}${Math.abs(p)}%)`);
    }
  }
  return lines.join("\n");
}

export function renderUninstall(result: UninstallResult, apply: boolean): string {
  const lines: string[] = [`${apply ? "Uninstalled" : "Would uninstall"} ${result.harness} integration`, ""];
  if (!result.changed) {
    lines.push("Nothing to remove — no HarnessTrim files found in the install set.");
    return lines.join("\n");
  }
  for (const action of result.actions) {
    const verb =
      action.type === "remove-file" || action.type === "remove-dir"
        ? apply
          ? "removed"
          : "remove"
        : action.type === "write"
          ? apply
            ? "updated"
            : "update"
          : "clean";
    lines.push(`  ${verb.padEnd(8)} ${action.path}`);
    if (action.note) lines.push(`             (${action.note})`);
  }
  if (!apply) {
    lines.push("");
    lines.push("Dry run — nothing written. Re-run with `--apply`.");
  }
  lines.push("");
  lines.push("Only files HarnessTrim wrote are touched; marker-guarded regions and your");
  lines.push("other settings/hook entries are preserved.");
  return lines.join("\n");
}

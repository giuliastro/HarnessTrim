import type { Preset } from "@harnesstrim/core";
import type { DoctorReport, Severity } from "./doctor.ts";
import type { InstallResult } from "./install.ts";
import type { MetricsResult } from "./metrics.ts";
import type { CodexInstallResult } from "./install-codex.ts";
import type { ClaudeInstallResult } from "./install-claude.ts";
import type { PiInstallResult } from "./install-pi.ts";
import type { HermesInstallResult } from "./install-hermes.ts";

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
  if (result.alreadyInstalled) {
    lines.push(`Already installed: ${result.configPath} already wires in the HarnessTrim adapter.`);
    return lines.join("\n");
  }
  if (apply) {
    lines.push(`Wrote ${result.configPath}:`);
    lines.push(JSON.stringify(result.nextConfig, null, 2));
  } else {
    lines.push(`Dry run — no files changed. This is what \`--apply\` would write to ${result.configPath}:`);
    lines.push("");
    lines.push(JSON.stringify(result.nextConfig, null, 2));
    lines.push("");
    lines.push("Re-run with `--apply` to write it.");
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
    plan.instructionsAction === "present"
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

  if (plan.settingsAction === "present") {
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
  lines.push("Note: the hook command is `harnesstrim hook claude` — ensure harnesstrim is on PATH.");
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
    lines.push("Restart Hermes to load the refreshed plugin.");
  } else {
    lines.push(`  Source: ${plan.pluginSource}`);
    lines.push(`  Dest:   ${plan.pluginDest}`);
    lines.push("  (plugin.yaml + __init__.py; plugin will be enabled on --apply when Hermes CLI is available)");
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

  if (plan.alreadyInstalled) {
    lines.push(`Pi extension already installed at ${plan.extensionDest} (no change).`);
  } else {
    lines.push(`Extension -> ${plan.extensionDest}`);
    if (apply) {
      lines.push(`  Copied: ${result.copiedFiles.join(", ")}`);
    } else {
      lines.push(`  Source: ${plan.extensionSource}`);
      lines.push("  (harnesstrim.ts + .installed marker)");
    }
    lines.push("");
    lines.push("The extension hooks Pi's `tool_result` and needs `harnesstrim` on PATH.");
    lines.push("It starts in dry-run (logs to stderr); set HARNESSTRIM_MODE=active to reduce.");
  }

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
    `Reductions: ${s.events}`,
    `Chars:      ${s.beforeChars} -> ${s.afterChars}  (saved ${s.savedChars}, -${s.reductionPct}%)`,
    "",
    "By reducer:",
  ];
  for (const b of s.byReducer) {
    const p = b.beforeChars === 0 ? 0 : Math.round((b.savedChars / b.beforeChars) * 1000) / 10;
    lines.push(`  ${b.reducer.padEnd(20)} ${b.count}x  saved ${b.savedChars} chars (-${p}%)`);
  }
  return lines.join("\n");
}

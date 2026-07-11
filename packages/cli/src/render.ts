import type { Preset } from "@harnesstrim/core";
import type { DoctorReport, Severity } from "./doctor.ts";
import type { InstallResult } from "./install.ts";
import type { MetricsResult } from "./metrics.ts";

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

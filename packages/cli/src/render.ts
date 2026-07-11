import type { DoctorReport, Severity } from "./doctor.ts";
import type { InstallResult } from "./install.ts";

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
    lines.push("");
    lines.push("Adapter starts in whatever mode you configure (default: active). See the adapter README.");
  } else {
    lines.push(`Dry run — no files changed. This is what \`--apply\` would write to ${result.configPath}:`);
    lines.push("");
    lines.push(JSON.stringify(result.nextConfig, null, 2));
    lines.push("");
    lines.push("Re-run with `--apply` to write it.");
  }
  return lines.join("\n");
}

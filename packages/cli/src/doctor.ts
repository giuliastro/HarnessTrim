import fs from "node:fs";
import path from "node:path";

export type Severity = "warn" | "info" | "ok";

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  suggestion?: string;
}

export interface DoctorReport {
  dir: string;
  findings: Finding[];
}

/** Rough, clearly-labeled token estimate. Not tokenizer-accurate — used only for "this file is big" heuristics. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Instruction files that harnesses load into context every session. */
const INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules", ".windsurfrules"];
/** Above this size, an always-loaded instruction file is a standing per-session token cost. */
const LARGE_INSTRUCTION_CHARS = 4000;

/** Directories where on-demand skills live across harnesses. */
const SKILL_DIRS = [".claude/skills", ".opencode/skills", ".agents/skills", "skills"];

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function countSkills(dir: string): number {
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "SKILL.md"))) {
      count++;
    }
  }
  return count;
}

function checkInstructionFiles(dir: string, findings: Finding[]): void {
  for (const name of INSTRUCTION_FILES) {
    const content = readIfExists(path.join(dir, name));
    if (content === null) continue;
    const chars = content.length;
    const tokens = estimateTokens(chars);
    if (chars > LARGE_INSTRUCTION_CHARS) {
      findings.push({
        severity: "warn",
        title: `${name} is large (~${tokens} tokens, loaded every session)`,
        detail: `${chars} chars. Always-loaded instruction files are a fixed per-session token cost.`,
        suggestion:
          "Move recurring procedures into on-demand skills (SKILL.md), keeping only always-relevant rules here.",
      });
    } else {
      findings.push({
        severity: "info",
        title: `${name} present (~${tokens} tokens)`,
        detail: `${chars} chars — within a reasonable always-loaded budget.`,
      });
    }
  }
}

function checkSkills(dir: string, findings: Finding[]): void {
  let total = 0;
  const locations: string[] = [];
  for (const rel of SKILL_DIRS) {
    const n = countSkills(path.join(dir, rel));
    if (n > 0) {
      total += n;
      locations.push(`${rel} (${n})`);
    }
  }
  if (total > 0) {
    findings.push({
      severity: "ok",
      title: `${total} on-demand skill(s) found`,
      detail: `Locations: ${locations.join(", ")}. On-demand loading keeps fixed context low.`,
    });
  } else {
    findings.push({
      severity: "info",
      title: "No skills found",
      detail: "No SKILL.md directories detected.",
      suggestion: "Consider HarnessTrim's portable skills (delta-response, debug-log-slim, review-delta).",
    });
  }
}

function checkOpenCode(dir: string, findings: Finding[]): void {
  const raw = readIfExists(path.join(dir, "opencode.json"));
  if (raw === null) {
    findings.push({
      severity: "info",
      title: "No opencode.json found",
      detail: "No OpenCode project config in this directory.",
    });
    return;
  }
  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    findings.push({
      severity: "warn",
      title: "opencode.json is not valid JSON",
      detail: "Could not parse opencode.json to check plugin wiring.",
    });
    return;
  }
  const plugins = extractPluginNames(config);
  const installed = plugins.some((p) => p.includes("@harnesstrim/adapter-opencode"));
  if (installed) {
    findings.push({
      severity: "ok",
      title: "HarnessTrim OpenCode adapter is wired in",
      detail: "@harnesstrim/adapter-opencode is present in opencode.json plugins.",
    });
  } else {
    findings.push({
      severity: "warn",
      title: "HarnessTrim adapter not installed in opencode.json",
      detail: "The OpenCode adapter would slim tool output automatically.",
      suggestion: "Run `harnesstrim install opencode` to wire it in.",
    });
  }
}

/** Extract plugin names from an opencode.json config, tolerating string and [name, opts] entries. */
export function extractPluginNames(config: unknown): string[] {
  if (typeof config !== "object" || config === null) return [];
  const plugin = (config as Record<string, unknown>).plugin;
  if (!Array.isArray(plugin)) return [];
  const names: string[] = [];
  for (const entry of plugin) {
    if (typeof entry === "string") names.push(entry);
    else if (Array.isArray(entry) && typeof entry[0] === "string") names.push(entry[0]);
  }
  return names;
}

/**
 * Inspect a project directory for token-waste signals across harnesses:
 * oversized always-loaded instruction files, whether on-demand skills are used,
 * and whether the OpenCode adapter is wired in. Pure and synchronous.
 */
export function inspect(dir: string): DoctorReport {
  const findings: Finding[] = [];
  checkInstructionFiles(dir, findings);
  checkSkills(dir, findings);
  checkOpenCode(dir, findings);
  return { dir, findings };
}

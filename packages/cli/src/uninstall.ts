import fs from "node:fs";
import path from "node:path";
import { HARNESSTRIM_MARKER as CLAUDE_MARKER } from "@harnesstrim/adapter-claude";
import { HARNESSTRIM_MARKER as CODEX_MARKER } from "@harnesstrim/adapter-codex";
import { OMP_HOOK_NAME, OMP_CONFIG_NAME, OMP_HOOK_MARKER } from "@harnesstrim/adapter-omp";
import { OPENCODE_PLUGIN_NAME } from "./install.ts";
import { listShippedSkills, resolveSkillsSourceDir } from "./skills-source.ts";
import { piExtensionDir, ompHooksDir } from "./scope.ts";

/**
 * `harnesstrim uninstall <harness>` — remove ONLY what `install <harness>` wrote.
 * Dry-run by default (`--apply` to write). Never touches files the installer did not
 * create and never removes content outside marker-guarded regions:
 *  - claude: shipped skills, the hook entry in .claude/settings.json, the marker-guarded
 *    CLAUDE.md snippet.
 *  - codex: shipped skills, the marker-guarded AGENTS.md snippet, the hook in hooks.json.
 *  - opencode: the wrapper + the .opencode/package.json dependency (removes package.json
 *    when our dependency was its only content).
 *  - hermes: the plugin dir (only when the .installed marker is present).
 *  - pi: the extension dir (only when the .installed marker is present).
 *  - omp: the hook file (only when it carries our marker) + the baked config file.
 */

export interface UninstallAction {
  type: "remove-file" | "remove-dir" | "write" | "clean";
  /** Absolute path this action targets. */
  path: string;
  /** Human-readable note on what would happen. */
  note?: string;
}

export interface UninstallPlan {
  harness: string;
  dir: string;
  changed: boolean;
  actions: UninstallAction[];
}

export interface UninstallResult extends UninstallPlan {
  applied: boolean;
}

function readOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Strip the marker-guarded region (`harnesstrim:begin` ... `harnesstrim:end`). */
function stripMarkedRegion(content: string, marker: string): string | null {
  const begin = `<!-- ${marker} -->`;
  const end = "<!-- harnesstrim:end -->";
  const start = content.indexOf(begin);
  if (start === -1) return content;
  const endIdx = content.indexOf(end, start);
  if (endIdx === -1) return content;
  const after = content.slice(endIdx + end.length);
  const before = content.slice(0, start).replace(/\s+$/, "");
  const next = (before + "\n" + after.replace(/^\s+/, "")).replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

/** Remove every PostToolUse hook entry whose command runs `harnesstrim hook`. */
function stripHookEntries(settings: Record<string, unknown>): { next: Record<string, unknown>; removed: boolean } {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (!hooks || !Array.isArray(hooks.PostToolUse)) return { next: settings, removed: false };
  const post = hooks.PostToolUse as unknown[];
  const kept = post.filter((entry) => {
    const hooksArr = (entry as { hooks?: Array<{ command?: string }> }).hooks;
    if (!Array.isArray(hooksArr)) return true;
    return !hooksArr.some((h) => typeof h.command === "string" && h.command.includes("harnesstrim hook"));
  });
  if (kept.length === post.length) return { next: settings, removed: false };
  const nextHooks: Record<string, unknown> = { ...hooks };
  nextHooks.PostToolUse = kept;
  const next: Record<string, unknown> = { ...settings, hooks: nextHooks };
  return { next, removed: true };
}

function isSkillDir(pathName: string): boolean {
  try {
    return fs.statSync(pathName).isDirectory();
  } catch {
    return false;
  }
}

function markerPresent(dest: string): boolean {
  try {
    return fs.statSync(path.join(dest, ".installed")).isFile();
  } catch {
    return false;
  }
}

/** Build the shared "remove shipped skills from dest" actions. */
function skillRemovalActions(dir: string, destRel: string): UninstallAction[] {
  const sourceDir = resolveSkillsSourceDir();
  const shipped = listShippedSkills(sourceDir);
  const dest = path.join(dir, destRel);
  const actions: UninstallAction[] = [];
  for (const name of shipped) {
    const skillPath = path.join(dest, name);
    if (isSkillDir(skillPath)) {
      actions.push({ type: "remove-dir", path: skillPath, note: `skill directory installed by HarnessTrim` });
    }
  }
  // If removing the shipped skills leaves only empty dirs behind, take the parent too —
  // but never touch sibling entries that aren't ours.
  if (actions.length > 0 && isSkillDir(dest)) {
    const remaining = fs.readdirSync(dest).filter((name) => !shipped.includes(name));
    if (remaining.length === 0) {
      actions.push({ type: "remove-dir", path: dest, note: "empty skills directory left by HarnessTrim" });
    }
  }
  return actions;
}

export function planClaudeUninstall(dir: string): UninstallPlan {
  const actions: UninstallAction[] = [...skillRemovalActions(dir, ".claude/skills")];

  const settingsPath = path.join(dir, ".claude", "settings.json");
  const settingsContent = readOrNull(settingsPath);
  if (settingsContent !== null) {
    try {
      const parsed = JSON.parse(settingsContent) as Record<string, unknown>;
      const { next, removed } = stripHookEntries(parsed);
      if (removed) {
        actions.push({
          type: Object.keys(next).length === 0 ? "remove-file" : "write",
          path: settingsPath,
          note: "remove the HarnessTrim PostToolUse hook",
        });
      }
    } catch {
      /* malformed settings: leave untouched (never clobber) */
    }
  }

  const claudeMdPath = path.join(dir, "CLAUDE.md");
  const claudeMd = readOrNull(claudeMdPath);
  if (claudeMd !== null && claudeMd.includes(CLAUDE_MARKER)) {
    const next = stripMarkedRegion(claudeMd, CLAUDE_MARKER);
    if (next !== null && next !== claudeMd) {
      actions.push({
        type: next.length === 0 ? "remove-file" : "write",
        path: claudeMdPath,
        note: "remove the marker-guarded HarnessTrim instruction",
      });
    }
  }

  return { harness: "claude", dir, changed: actions.length > 0, actions };
}

export function planCodexUninstall(dir: string): UninstallPlan {
  const actions: UninstallAction[] = [...skillRemovalActions(dir, ".codex/skills")];

  const agentsPath = path.join(dir, "AGENTS.md");
  const agents = readOrNull(agentsPath);
  if (agents !== null && agents.includes(CODEX_MARKER)) {
    const next = stripMarkedRegion(agents, CODEX_MARKER);
    if (next !== null && next !== agents) {
      actions.push({
        type: next.length === 0 ? "remove-file" : "write",
        path: agentsPath,
        note: "remove the marker-guarded HarnessTrim instruction",
      });
    }
  }

  const hooksPath = path.join(dir, ".codex", "hooks.json");
  const hooksContent = readOrNull(hooksPath);
  if (hooksContent !== null) {
    try {
      const parsed = JSON.parse(hooksContent) as Record<string, unknown>;
      const { next, removed } = stripHookEntries(parsed);
      if (removed) {
        actions.push({
          type: Object.keys(next).length === 0 ? "remove-file" : "write",
          path: hooksPath,
          note: "remove the HarnessTrim PostToolUse hook",
        });
      }
    } catch {
      /* malformed hooks: leave untouched */
    }
  }

  return { harness: "codex", dir, changed: actions.length > 0, actions };
}

export function planOpencodeUninstall(dir: string): UninstallPlan {
  const actions: UninstallAction[] = [];

  const wrapperPath = path.join(dir, ".opencode", "plugin", "harnesstrim.ts");
  const wrapper = readOrNull(wrapperPath);
  // Only remove the wrapper if it is ours (references the adapter package).
  if (wrapper !== null && wrapper.includes(OPENCODE_PLUGIN_NAME)) {
    actions.push({ type: "remove-file", path: wrapperPath, note: "HarnessTrim plugin wrapper" });
    // If the plugin dir contains nothing but the wrapper we are removing, it was
    // only ours — take it too.
    const pluginDir = path.join(dir, ".opencode", "plugin");
    if (fs.existsSync(pluginDir)) {
      const entries = fs.readdirSync(pluginDir).filter((name) => name !== "harnesstrim.ts");
      if (entries.length === 0) {
        actions.push({ type: "remove-dir", path: pluginDir, note: "empty plugin directory left by HarnessTrim" });
      }
    }
  }

  const pkgPath = path.join(dir, ".opencode", "package.json");
  const pkgContent = readOrNull(pkgPath);
  if (pkgContent !== null) {
    try {
      const parsed = JSON.parse(pkgContent) as Record<string, unknown>;
      const deps = parsed.dependencies as Record<string, unknown> | undefined;
      if (deps && typeof deps[OPENCODE_PLUGIN_NAME] === "string") {
        const nextDeps: Record<string, unknown> = { ...deps };
        delete nextDeps[OPENCODE_PLUGIN_NAME];
        const next = { ...parsed, dependencies: nextDeps };
        const onlyOurDep = Object.keys(nextDeps).length === 0 && Object.keys(parsed).length <= 1;
        actions.push({
          type: onlyOurDep ? "remove-file" : "write",
          path: pkgPath,
          note: onlyOurDep
            ? "remove .opencode/package.json (only declared the adapter)"
            : "drop the @harnesstrim/adapter-opencode dependency",
        });
      }
    } catch {
      /* malformed package.json: leave untouched */
    }
  }

  return { harness: "opencode", dir, changed: actions.length > 0, actions };
}

export function planHermesUninstall(dir: string): UninstallPlan {
  const pluginDest = path.join(dir, ".hermes", "plugins", "harnesstrim");
  const actions: UninstallAction[] = [];
  // Only a dir carrying our `.installed` marker is provably ours — never remove a
  // same-named dir the user created independently.
  if (markerPresent(pluginDest)) {
    actions.push({ type: "remove-dir", path: pluginDest, note: "Hermes plugin installed by HarnessTrim" });
  }
  return { harness: "hermes", dir, changed: actions.length > 0, actions };
}

export function planPiUninstall(dir: string, home?: string): UninstallPlan {
  const dest = piExtensionDir(dir, home);
  const actions: UninstallAction[] = [];
  if (markerPresent(dest)) {
    actions.push({ type: "remove-dir", path: dest, note: "Pi extension installed by HarnessTrim" });
  }
  return { harness: "pi", dir, changed: actions.length > 0, actions };
}

export function planOmpUninstall(dir: string, home?: string): UninstallPlan {
  const hooks = ompHooksDir(dir, home);
  const actions: UninstallAction[] = [];

  const hookPath = path.join(hooks, "post", OMP_HOOK_NAME);
  const hookContent = readOrNull(hookPath);
  // Only a hook file carrying our marker is provably ours — never remove a same-named
  // file the user (or another tool) wrote independently in the shared hooks dir.
  if (hookContent !== null && hookContent.includes(OMP_HOOK_MARKER)) {
    actions.push({ type: "remove-file", path: hookPath, note: "OMP tool_result hook installed by HarnessTrim" });
  }

  const configPath = path.join(hooks, OMP_CONFIG_NAME);
  if (readOrNull(configPath) !== null) {
    actions.push({
      type: "remove-file",
      path: configPath,
      note: "baked harnesstrim.json (mode/min-length/metrics) installed by HarnessTrim",
    });
  }
  return { harness: "omp", dir, changed: actions.length > 0, actions };
}

/**
 * `home` overrides the directory that decides user vs project scope (pi and omp only).
 * Production callers omit it and get `os.homedir()`, exactly as the installers do; tests
 * pass it to pin a scope without moving the real home directory.
 */
export function planUninstall(harness: string, dir: string, home?: string): UninstallPlan {
  switch (harness) {
    case "claude":
      return planClaudeUninstall(dir);
    case "codex":
      return planCodexUninstall(dir);
    case "opencode":
      return planOpencodeUninstall(dir);
    case "hermes":
      return planHermesUninstall(dir);
    case "pi":
      return planPiUninstall(dir, home);
    case "omp":
      return planOmpUninstall(dir, home);
    default:
      throw new Error(`Unknown uninstall target: ${harness}. Supported: opencode, codex, claude, hermes, pi, omp.`);
  }
}

/** Apply an uninstall plan (destructive). Returns the resulting plan with applied=true. */
export function runUninstall(harness: string, dir: string, apply: boolean, home?: string): UninstallResult {
  const plan = planUninstall(harness, dir, home);
  if (!apply || !plan.changed) return { ...plan, applied: false };

  for (const action of plan.actions) {
    switch (action.type) {
      case "remove-file":
        fs.rmSync(action.path, { force: true });
        break;
      case "remove-dir":
        fs.rmSync(action.path, { recursive: true, force: true });
        break;
      case "write": {
        if (action.path.endsWith("settings.json") || action.path.endsWith("hooks.json")) {
          const raw = readOrNull(action.path);
          if (raw !== null) {
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              const { next } = stripHookEntries(parsed);
              fs.writeFileSync(action.path, JSON.stringify(next, null, 2) + "\n");
            } catch {
              /* never clobber malformed JSON */
            }
          }
        } else if (action.path.endsWith(path.join(".opencode", "package.json"))) {
          const raw = readOrNull(action.path);
          if (raw !== null) {
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              const deps = { ...((parsed.dependencies as Record<string, unknown>) ?? {}) };
              delete deps[OPENCODE_PLUGIN_NAME];
              fs.writeFileSync(action.path, JSON.stringify({ ...parsed, dependencies: deps }, null, 2) + "\n");
            } catch {
              /* never clobber malformed package.json */
            }
          }
        } else {
          const marker = action.path.endsWith("CLAUDE.md") ? CLAUDE_MARKER : CODEX_MARKER;
          const raw = readOrNull(action.path);
          if (raw !== null) {
            const next = stripMarkedRegion(raw, marker);
            if (next !== null) fs.writeFileSync(action.path, next + "\n");
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return { ...plan, applied: true };
}

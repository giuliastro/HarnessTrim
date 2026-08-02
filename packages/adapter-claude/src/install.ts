import path from "node:path";

/** The command Claude Code runs for the PostToolUse hook. Requires `harnesstrim` on PATH. */
export const HOOK_COMMAND = "harnesstrim hook claude";
/** Tools whose output the hook reduces. Bash is the shell channel where test/diff output appears. */
export const HOOK_MATCHER = "Bash";

/** Marker guarding the CLAUDE.md instruction block (idempotent append). */
export const HARNESSTRIM_MARKER = "harnesstrim:begin";

/**
 * CLAUDE.md instruction telling the model to pipe noisy output through the reducer. This is
 * the *effective* reduction path on Claude Code today: the PostToolUse hook is spec-correct
 * but current Claude Code versions do not apply `updatedToolOutput`, so the pipe (which slims
 * in the shell before output reaches the model) is what actually saves tokens. `--metrics`
 * records each reduction so `harnesstrim metrics` can report the savings.
 */
export const REDUCE_INSTRUCTION_SNIPPET = `<!-- ${HARNESSTRIM_MARKER} -->
## Token economy (HarnessTrim)

When a shell command produces long, noisy output — test runners, \`git diff\`, build logs,
large file dumps — pipe it through the reducer so only the signal enters context:

    <your command> 2>&1 | harnesstrim reduce --metrics .harnesstrim/metrics.jsonl

This keeps failures, errors, assertions, and summaries while dropping passing-test noise and
generated-file (lockfile/dist) diffs, and records what was saved. Prefer the installed skills
for output, review, and scaffolding discipline.
<!-- harnesstrim:end -->`;

export type InstructionsAction = "create" | "append" | "present" | "skip";

export type SettingsAction = "create" | "patch" | "present" | "skip";

export interface SkillCopy {
  name: string;
  from: string;
  to: string;
  present: boolean;
}

export interface ClaudeInstallPlan {
  skillsDest: string;
  skills: SkillCopy[];
  settingsFile: string;
  settingsAction: SettingsAction;
  /** The full settings object to write (existing keys preserved, hook added). */
  nextSettings: Record<string, unknown>;
  /** CLAUDE.md reduce-pipe instruction wiring. */
  instructionsFile: string;
  instructionsAction: InstructionsAction;
  instructionsSnippet: string;
  /** Whether any write would change state (false when the desired state is already present). */
  changed: boolean;
}

export interface ClaudeInstallInput {
  projectDir: string;
  skillsSourceDir: string;
  skillNames: string[];
  /** Current content of .claude/settings.json, or null if it does not exist. */
  settingsJsonContent: string | null;
  /** Current content of CLAUDE.md, or null if it does not exist. */
  claudeMdContent: string | null;
  existingSkillNames: string[];
  /** Install skills without the PostToolUse hook (skills-only state). Default false. */
  includeHook?: boolean;
  /** Install skills without the marker-guarded CLAUDE.md reduce-pipe instruction. Default true. */
  includeInstructions?: boolean;
}

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

function hasHarnessTrimHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  const post = hooks?.PostToolUse;
  if (!Array.isArray(post)) return false;
  return post.some((entry: HookEntry) =>
    Array.isArray(entry?.hooks) && entry.hooks.some((h) => typeof h?.command === "string" && h.command.includes("harnesstrim hook"))
  );
}

/**
 * Compute a Claude Code install: copy the skill pack into `.claude/skills` and add a
 * PostToolUse hook (matched to Bash) that runs the reducer. Pure — no filesystem access.
 * Preserves existing settings keys and other hooks; the hook is added only if not already
 * present (idempotent).
 */
export function planClaudeInstall(input: ClaudeInstallInput): ClaudeInstallPlan {
  const includeHook = input.includeHook ?? true;
  const includeInstructions = input.includeInstructions ?? true;
  const skillsDest = path.join(input.projectDir, ".claude", "skills");
  const existing = new Set(input.existingSkillNames);
  const skills: SkillCopy[] = input.skillNames.map((name) => ({
    name,
    from: path.join(input.skillsSourceDir, name),
    to: path.join(skillsDest, name),
    present: existing.has(name),
  }));

  let settings: Record<string, unknown> = {};
  let action: SettingsAction;
  if (input.settingsJsonContent === null) {
    action = "create";
  } else {
    try {
      const parsed = JSON.parse(input.settingsJsonContent);
      settings = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      // Malformed settings: treat as create-from-scratch rather than clobber silently.
      settings = {};
    }
    action = hasHarnessTrimHook(settings) ? "present" : "patch";
  }

  // Skills-only install: never touch settings (the hook is the only settings write).
  if (!includeHook) {
    action = "skip";
    settings = input.settingsJsonContent === null ? {} : settings;
  }

  const nextSettings = action === "present" || action === "skip" ? settings : addHook(settings);

  const instructionsAction: InstructionsAction =
    !includeInstructions
      ? "skip"
      : input.claudeMdContent === null
        ? "create"
        : input.claudeMdContent.includes(HARNESSTRIM_MARKER)
          ? "present"
          : "append";

  return {
    skillsDest,
    skills,
    settingsFile: path.join(input.projectDir, ".claude", "settings.json"),
    settingsAction: action,
    nextSettings,
    instructionsFile: path.join(input.projectDir, "CLAUDE.md"),
    instructionsAction,
    instructionsSnippet: REDUCE_INSTRUCTION_SNIPPET,
    changed: skills.some((s) => !s.present) || (action !== "present" && action !== "skip") || (instructionsAction !== "present" && instructionsAction !== "skip"),
  };
}

/** Return a copy of settings with the HarnessTrim PostToolUse hook appended. */
function addHook(settings: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...settings };
  const hooks: Record<string, unknown> = { ...((next.hooks as Record<string, unknown>) ?? {}) };
  const post: HookEntry[] = Array.isArray(hooks.PostToolUse) ? [...(hooks.PostToolUse as HookEntry[])] : [];
  post.push({ matcher: HOOK_MATCHER, hooks: [{ type: "command", command: HOOK_COMMAND }] });
  hooks.PostToolUse = post;
  next.hooks = hooks;
  return next;
}

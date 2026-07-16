import path from "node:path";
export * from "./hook.ts";

/**
 * HarnessTrim adapter for Codex.
 *
 * Codex has no supported in-place tool-output transform like OpenCode. Its native
 * surfaces are Agent Skills, `AGENTS.md`, and lifecycle hooks. The stable default
 * integrates two ways (matching the source proposal's "regole/istruzioni in Codex" +
 * skills):
 *   1. install the portable skill bundle into a Codex-readable skills directory, and
 *   2. append an AGENTS.md instruction telling the agent to pipe noisy command output
 *      through `harnesstrim reduce` (the deterministic reducer, RTK-style).
 *
 * The planner is pure (takes the current AGENTS.md content and the set of already-present
 * skills); a runner in the CLI performs the file IO.
 */

export const HARNESSTRIM_MARKER = "harnesstrim:begin";
export const CODEX_HOOK_COMMAND = "harnesstrim hook codex --metrics .harnesstrim/metrics.jsonl";
export const CODEX_HOOK_MATCHER = "^Bash$";

export const REDUCE_INSTRUCTION_SNIPPET = `<!-- ${HARNESSTRIM_MARKER} -->
## Token economy (HarnessTrim)

When a shell command produces long, noisy output — test runners, \`git diff\`, build logs,
large file dumps — pipe it through the reducer so only the signal enters context:

    <your command> 2>&1 | harnesstrim reduce

This keeps failures, errors, assertions, and summaries while dropping passing-test noise and
generated-file (lockfile/dist) diffs. Prefer the installed skills for output, review, and
scaffolding discipline.
<!-- harnesstrim:end -->`;

export type InstructionsAction = "create" | "append" | "present";

export interface SkillCopy {
  name: string;
  from: string;
  to: string;
  /** True if a skill of this name is already present at the destination. */
  present: boolean;
}

export interface CodexInstallPlan {
  skillsDest: string;
  skills: SkillCopy[];
  instructionsFile: string;
  instructionsAction: InstructionsAction;
  instructionsSnippet: string;
}

export interface CodexInstallInput {
  projectDir: string;
  /** Directory the shipped skills are read from. */
  skillsSourceDir: string;
  /** Skill names to install. */
  skillNames: string[];
  /** Current content of AGENTS.md, or null if it does not exist. */
  agentsMdContent: string | null;
  /** Skill names already present at the destination. */
  existingSkillNames: string[];
}

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string }>;
}

export type HooksAction = "create" | "patch" | "present";

export interface CodexHookInstallPlan {
  hooksFile: string;
  action: HooksAction;
  /** Complete hooks.json content to write when the action is create or patch. */
  nextHooks: Record<string, unknown>;
}

export interface CodexHookInstallInput {
  projectDir: string;
  /** Current .codex/hooks.json content, or null when it does not exist. */
  hooksJsonContent: string | null;
}

function hasHarnessTrimHook(document: Record<string, unknown>): boolean {
  const hooks = document.hooks as Record<string, unknown> | undefined;
  const post = hooks?.PostToolUse;
  if (!Array.isArray(post)) return false;
  return post.some((entry: HookEntry) =>
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((hook) => typeof hook?.command === "string" && hook.command.includes("harnesstrim hook codex"))
  );
}

/**
 * Plan the optional Codex PostToolUse integration. It deliberately targets only Bash:
 * Codex does not currently support a native replacement field for tool output, so the
 * runtime hook uses its documented block-and-replace fallback for simple shell calls.
 */
export function planCodexHookInstall(input: CodexHookInstallInput): CodexHookInstallPlan {
  let document: Record<string, unknown> = {};
  let action: HooksAction;
  if (input.hooksJsonContent === null) {
    action = "create";
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.hooksJsonContent);
    } catch {
      throw new Error(".codex/hooks.json is not valid JSON; refusing to overwrite it.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(".codex/hooks.json must contain a JSON object; refusing to overwrite it.");
    }
    document = parsed as Record<string, unknown>;
    action = hasHarnessTrimHook(document) ? "present" : "patch";
  }

  if (action === "present") {
    return { hooksFile: path.join(input.projectDir, ".codex", "hooks.json"), action, nextHooks: document };
  }

  const hooks: Record<string, unknown> = { ...((document.hooks as Record<string, unknown>) ?? {}) };
  const post: HookEntry[] = Array.isArray(hooks.PostToolUse) ? [...(hooks.PostToolUse as HookEntry[])] : [];
  post.push({ matcher: CODEX_HOOK_MATCHER, hooks: [{ type: "command", command: CODEX_HOOK_COMMAND }] });
  hooks.PostToolUse = post;

  return {
    hooksFile: path.join(input.projectDir, ".codex", "hooks.json"),
    action,
    nextHooks: { ...document, hooks },
  };
}

/**
 * Compute what a Codex install would do. Pure: no filesystem access. Skills already
 * present at the destination are marked `present: true` and skipped by the runner;
 * the AGENTS.md snippet is added only if its marker is not already there (idempotent).
 */
export function planCodexInstall(input: CodexInstallInput): CodexInstallPlan {
  const skillsDest = path.join(input.projectDir, ".codex", "skills");
  const existing = new Set(input.existingSkillNames);
  const skills: SkillCopy[] = input.skillNames.map((name) => ({
    name,
    from: path.join(input.skillsSourceDir, name),
    to: path.join(skillsDest, name),
    present: existing.has(name),
  }));

  let instructionsAction: InstructionsAction;
  if (input.agentsMdContent === null) {
    instructionsAction = "create";
  } else if (input.agentsMdContent.includes(HARNESSTRIM_MARKER)) {
    instructionsAction = "present";
  } else {
    instructionsAction = "append";
  }

  return {
    skillsDest,
    skills,
    instructionsFile: path.join(input.projectDir, "AGENTS.md"),
    instructionsAction,
    instructionsSnippet: REDUCE_INSTRUCTION_SNIPPET,
  };
}

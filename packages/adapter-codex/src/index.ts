import path from "node:path";

/**
 * HarnessTrim adapter for Codex.
 *
 * Codex has no `tool.execute` output hook like OpenCode. Its native surfaces are the
 * Agent Skills standard and the `AGENTS.md` instruction file. So this adapter integrates
 * two ways (matching the source proposal's "regole/istruzioni in Codex" + skills):
 *   1. install the portable skill bundle into a Codex-readable skills directory, and
 *   2. append an AGENTS.md instruction telling the agent to pipe noisy command output
 *      through `harnesstrim reduce` (the deterministic reducer, RTK-style).
 *
 * The planner is pure (takes the current AGENTS.md content and the set of already-present
 * skills); a runner in the CLI performs the file IO.
 */

export const HARNESSTRIM_MARKER = "harnesstrim:begin";

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

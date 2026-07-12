import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { planClaudeInstall, HOOK_COMMAND, HOOK_MATCHER } from "./install.ts";

const base = {
  projectDir: "/proj",
  skillsSourceDir: "/repo/skills",
  skillNames: ["delta-response", "review-delta"],
  settingsJsonContent: null as string | null,
  existingSkillNames: [] as string[],
};

test("skills plan targets .claude/skills", () => {
  const plan = planClaudeInstall(base);
  assert.equal(plan.skillsDest, path.join("/proj", ".claude", "skills"));
  assert.equal(plan.skills.length, 2);
  assert.equal(plan.skills[0].present, false);
});

test("settings action create adds a PostToolUse Bash hook", () => {
  const plan = planClaudeInstall(base);
  assert.equal(plan.settingsAction, "create");
  const post = (plan.nextSettings.hooks as any).PostToolUse;
  assert.equal(post[0].matcher, HOOK_MATCHER);
  assert.equal(post[0].hooks[0].command, HOOK_COMMAND);
});

test("settings action patch preserves existing keys and hooks", () => {
  const existing = JSON.stringify({
    model: "sonnet",
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "other" }] }] },
  });
  const plan = planClaudeInstall({ ...base, settingsJsonContent: existing });
  assert.equal(plan.settingsAction, "patch");
  assert.equal(plan.nextSettings.model, "sonnet");
  assert.ok((plan.nextSettings.hooks as any).PreToolUse); // untouched
  assert.equal((plan.nextSettings.hooks as any).PostToolUse[0].hooks[0].command, HOOK_COMMAND);
});

test("settings action present is idempotent", () => {
  const withHook = JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "harnesstrim hook claude" }] }] },
  });
  const plan = planClaudeInstall({ ...base, settingsJsonContent: withHook });
  assert.equal(plan.settingsAction, "present");
  // no duplicate hook added
  assert.equal((plan.nextSettings.hooks as any).PostToolUse.length, 1);
});

test("marks already-present skills", () => {
  const plan = planClaudeInstall({ ...base, existingSkillNames: ["review-delta"] });
  assert.equal(plan.skills.find((s) => s.name === "review-delta")?.present, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { planCodexHookInstall, planCodexInstall, HARNESSTRIM_MARKER } from "./index.ts";

const base = {
  projectDir: "/proj",
  skillsSourceDir: "/repo/skills",
  skillNames: ["delta-response", "debug-log-slim"],
  agentsMdContent: null as string | null,
  existingSkillNames: [] as string[],
};

test("plans skill copies into .codex/skills with source and dest paths", () => {
  const plan = planCodexInstall(base);
  assert.equal(plan.skillsDest, path.join("/proj", ".codex", "skills"));
  assert.equal(plan.skills.length, 2);
  assert.equal(plan.skills[0].from, path.join("/repo/skills", "delta-response"));
  assert.equal(plan.skills[0].to, path.join("/proj", ".codex", "skills", "delta-response"));
  assert.equal(plan.skills[0].present, false);
});

test("marks already-present skills", () => {
  const plan = planCodexInstall({ ...base, existingSkillNames: ["delta-response"] });
  assert.equal(plan.skills.find((s) => s.name === "delta-response")?.present, true);
  assert.equal(plan.skills.find((s) => s.name === "debug-log-slim")?.present, false);
});

test("instructions action: create when AGENTS.md is absent", () => {
  assert.equal(planCodexInstall({ ...base, agentsMdContent: null }).instructionsAction, "create");
});

test("instructions action: append when AGENTS.md exists without the marker", () => {
  assert.equal(
    planCodexInstall({ ...base, agentsMdContent: "# My project\n" }).instructionsAction,
    "append"
  );
});

test("instructions action: present (idempotent) when the marker is already there", () => {
  const content = `# My project\n<!-- ${HARNESSTRIM_MARKER} -->\n...`;
  assert.equal(planCodexInstall({ ...base, agentsMdContent: content }).instructionsAction, "present");
});

test("snippet documents the reduce pipe", () => {
  const plan = planCodexInstall(base);
  assert.match(plan.instructionsSnippet, /harnesstrim reduce/);
});

test("plans an optional Codex Bash PostToolUse hook with telemetry", () => {
  const plan = planCodexHookInstall({ projectDir: "/proj", hooksJsonContent: null });
  assert.equal(plan.action, "create");
  const post = (plan.nextHooks.hooks as Record<string, unknown>).PostToolUse as Array<Record<string, unknown>>;
  assert.equal(post[0].matcher, "^Bash$");
  assert.match(JSON.stringify(post), /harnesstrim hook codex --metrics/);
});

test("keeps an existing Codex hook idempotent", () => {
  const hooks = JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "^Bash$", hooks: [{ type: "command", command: "harnesstrim hook codex --metrics x" }] }] },
  });
  assert.equal(planCodexHookInstall({ projectDir: "/proj", hooksJsonContent: hooks }).action, "present");
});

test("refuses to overwrite malformed hooks.json", () => {
  assert.throws(
    () => planCodexHookInstall({ projectDir: "/proj", hooksJsonContent: "{ nope" }),
    /not valid JSON/
  );
});

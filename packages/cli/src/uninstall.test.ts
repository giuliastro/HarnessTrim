import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planUninstall, runUninstall } from "./uninstall.ts";
import { resolveSkillsSourceDir } from "./skills-source.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-uninstall-"));
}

function makeSkills(dest: string): string[] {
  const sourceDir = resolveSkillsSourceDir();
  const names = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of names) {
    fs.mkdirSync(path.join(dest, name), { recursive: true });
    fs.writeFileSync(path.join(dest, name, "SKILL.md"), "---\nname: " + name + "\n---");
  }
  return names;
}

test("claude uninstall plans removing only HarnessTrim files", () => {
  const dir = tmpProject();
  const skills = makeSkills(path.join(dir, ".claude", "skills"));
  fs.writeFileSync(
    path.join(dir, ".claude", "settings.json"),
    JSON.stringify({
      model: "sonnet",
      hooks: {
        PostToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "harnesstrim hook claude" }] },
          { matcher: "Bash", hooks: [{ type: "command", command: "other hook" }] },
        ],
      },
    })
  );
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Project\n<!-- harnesstrim:begin -->\n## Token economy\n<!-- harnesstrim:end -->\nKeep\n");

  const plan = planUninstall("claude", dir);
  assert.equal(plan.changed, true);
  // one remove-dir per shipped skill + the now-empty parent skills dir
  assert.equal(plan.actions.filter((a) => a.type === "remove-dir").length, skills.length + 1);
  const settingsAction = plan.actions.find((a) => a.path.endsWith("settings.json"));
  assert.equal(settingsAction?.type, "write"); // preserved model + other hook
  const mdAction = plan.actions.find((a) => a.path.endsWith("CLAUDE.md"));
  assert.equal(mdAction?.type, "write");
});

test("claude uninstall dry-run writes nothing; --apply removes only ours", () => {
  const dir = tmpProject();
  makeSkills(path.join(dir, ".claude", "skills"));
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ model: "sonnet", hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "harnesstrim hook claude" }] }] } }));
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Project\n<!-- harnesstrim:begin -->\n## Token economy (HarnessTrim)\n<!-- harnesstrim:end -->\n");

  const dry = runUninstall("claude", dir, false);
  assert.equal(dry.applied, false);
  assert.ok(fs.existsSync(path.join(dir, ".claude", "skills")));

  const applied = runUninstall("claude", dir, true);
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(dir, ".claude", "skills")), false);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.model, "sonnet");
  assert.equal(settings.hooks.PostToolUse.length, 0);
  const md = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
  assert.match(md, /# Project/);
  assert.ok(!md.includes("harnesstrim:begin"));
});

test("claude uninstall is a no-op when nothing was installed", () => {
  const dir = tmpProject();
  const plan = planUninstall("claude", dir);
  assert.equal(plan.changed, false);
});

test("opencode uninstall removes the wrapper and drops the dependency", () => {
  const dir = tmpProject();
  const pluginDir = path.join(dir, ".opencode", "plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "harnesstrim.ts"), "import { HarnessTrim } from \"@harnesstrim/adapter-opencode\";\nexport const HarnessTrimPlugin = (i) => HarnessTrim(i, {});");
  fs.writeFileSync(
    path.join(dir, ".opencode", "package.json"),
    JSON.stringify({ dependencies: { "@harnesstrim/adapter-opencode": "^0.0.2", other: "1" } })
  );

  const plan = planUninstall("opencode", dir);
  assert.equal(plan.changed, true);
  const result = runUninstall("opencode", dir, true);
  assert.equal(fs.existsSync(path.join(pluginDir, "harnesstrim.ts")), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, ".opencode", "package.json"), "utf8"));
  assert.equal(pkg.dependencies.other, "1");
  assert.equal(pkg.dependencies["@harnesstrim/adapter-opencode"], undefined);
  assert.equal(result.applied, true);
});

test("opencode uninstall removes package.json when it only declared the adapter", () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, ".opencode", "plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".opencode", "plugin", "harnesstrim.ts"), "import { HarnessTrim } from \"@harnesstrim/adapter-opencode\";");
  fs.writeFileSync(path.join(dir, ".opencode", "package.json"), JSON.stringify({ dependencies: { "@harnesstrim/adapter-opencode": "^0.0.2" } }));
  runUninstall("opencode", dir, true);
  assert.equal(fs.existsSync(path.join(dir, ".opencode", "package.json")), false);
});

test("hermes uninstall removes the plugin dir only when the marker is present", () => {
  const dir = tmpProject();
  const pluginDest = path.join(dir, ".hermes", "plugins", "harnesstrim");
  fs.mkdirSync(pluginDest, { recursive: true });
  // no .installed marker → not considered ours
  assert.equal(planUninstall("hermes", dir).changed, false);
  fs.writeFileSync(path.join(pluginDest, ".installed"), "# harnesstrim:plugin-ready");
  assert.equal(planUninstall("hermes", dir).changed, true);
  runUninstall("hermes", dir, true);
  assert.equal(fs.existsSync(pluginDest), false);
});

test("unknown uninstall target throws", () => {
  assert.throws(() => planUninstall("nope", "/tmp"), /Unknown uninstall target/);
});

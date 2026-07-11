import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, getPreset, listPresets } from "./index.ts";

const SHIPPED_SKILLS = new Set(["delta-response", "debug-log-slim", "review-delta", "compact-handoff"]);

test("getPreset returns a known preset and undefined otherwise", () => {
  assert.equal(getPreset("lean-debug")?.name, "lean-debug");
  assert.equal(getPreset("nope"), undefined);
});

test("listPresets returns all presets", () => {
  assert.equal(listPresets().length, Object.keys(PRESETS).length);
  assert.ok(listPresets().length >= 3);
});

test("every preset references only shipped skills", () => {
  for (const preset of listPresets()) {
    for (const skill of preset.skills) {
      assert.ok(SHIPPED_SKILLS.has(skill), `${preset.name} references unshipped skill: ${skill}`);
    }
  }
});

test("preset key matches its name field", () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    assert.equal(key, preset.name);
  }
});

test("preset adapter config is well-formed", () => {
  for (const preset of listPresets()) {
    assert.ok(preset.adapter.minLength > 0);
    assert.ok(["active", "dryrun"].includes(preset.adapter.mode));
  }
});

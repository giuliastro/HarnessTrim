import { describe, expect, it } from "vitest";
import { pickReducer, reduceAuto } from "./dispatch.ts";

function pnpmWall(): string {
  const progress = Array.from(
    { length: 12 },
    (_, index) =>
      `Progress: resolved ${index + 1}, reused ${index}, downloaded 0, added ${index}`,
  ).join("\n");
  return `Scope: all 6 workspace projects\n${progress}\nPackages: +125\nWARN deprecated sample@1.0.0\nProgress: resolved 125, reused 125, downloaded 0, added 125, done\nDone in 1.2s`;
}

describe("package-manager dispatch", () => {
  it("selects the pnpm reducer for a noisy progress wall", () => {
    const input = pnpmWall();
    expect(input.length).toBeGreaterThan(400);
    expect(pickReducer(input)?.name).toBe("package-manager-output-slim");

    const result = reduceAuto(input);
    expect(result.reducer).toBe("package-manager-output-slim");
    expect(result.changed).toBe(true);
    expect(result.output).toContain("WARN deprecated sample@1.0.0");
    expect(result.output).toContain("Progress: resolved 125, reused 125, downloaded 0, added 125, done");
  });

  it("fails closed to no reduction when too few progress lines are present", () => {
    const input = `${"context filler ".repeat(40)}\nProgress: resolved 1, reused 0, downloaded 0, added 0\nProgress: resolved 1, reused 1, downloaded 0, added 1, done`;
    const result = reduceAuto(input);
    expect(result.changed).toBe(false);
    expect(result.reducer).toBeNull();
    expect(result.output).toBe(input);
  });
});

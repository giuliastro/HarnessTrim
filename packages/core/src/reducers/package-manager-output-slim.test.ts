import { describe, expect, it } from "vitest";
import { packageManagerOutputSlim } from "./package-manager-output-slim.ts";

const noisy = `Scope: all 6 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +125
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 62, reused 60, downloaded 2, added 59
WARN deprecated inflight@1.0.6: This module is not supported
Progress: resolved 125, reused 120, downloaded 5, added 124
Progress: resolved 125, reused 120, downloaded 5, added 125, done

devDependencies:
+ prettier 3.6.2
+ typescript 5.9.3

Done in 1.8s using pnpm v10.33.4`;

describe("packageManagerOutputSlim", () => {
  it("collapses intermediate pnpm progress while preserving final state and signal", () => {
    const result = packageManagerOutputSlim.reduce(noisy);

    expect(result.changed).toBe(true);
    expect(result.output).toContain("omitted 3 intermediate progress snapshot(s)");
    expect(result.output).toContain("Packages: +125");
    expect(result.output).toContain("WARN deprecated inflight@1.0.6");
    expect(result.output).toContain(
      "Progress: resolved 125, reused 120, downloaded 5, added 125, done",
    );
    expect(result.output).toContain("+ typescript 5.9.3");
    expect(result.output).toContain("Done in 1.8s using pnpm v10.33.4");
    expect(result.output).not.toContain("++++++++++++++++++++++++++++++++++++++++++++++++");
    expect(result.output.length).toBeLessThan(noisy.length);
  });

  it("is idempotent", () => {
    const first = packageManagerOutputSlim.reduce(noisy);
    const second = packageManagerOutputSlim.reduce(first.output);

    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  it("leaves one or two progress snapshots untouched", () => {
    const short = `Progress: resolved 1, reused 0, downloaded 0, added 0\nProgress: resolved 1, reused 1, downloaded 0, added 1, done`;
    expect(packageManagerOutputSlim.reduce(short)).toEqual({ output: short, changed: false });
  });

  it("does not treat arbitrary progress text as pnpm output", () => {
    const other = `Progress: indexing repository\nProgress: parsing AST\nProgress: writing report\n++++++++++++++++++++++++++++`;
    expect(packageManagerOutputSlim.reduce(other)).toEqual({ output: other, changed: false });
  });

  it("preserves lifecycle errors byte-for-byte", () => {
    const failing = `${noisy}\nERR_PNPM_RECURSIVE_RUN_FIRST_FAIL package failed\nELIFECYCLE Command failed with exit code 1`;
    const result = packageManagerOutputSlim.reduce(failing);

    expect(result.output).toContain("ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL package failed");
    expect(result.output).toContain("ELIFECYCLE Command failed with exit code 1");
  });
});

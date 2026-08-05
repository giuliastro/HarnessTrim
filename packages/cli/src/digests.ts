import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  REDUCE_INSTRUCTION_SNIPPET as CLAUDE_SNIPPET,
  HOOK_COMMAND as CLAUDE_HOOK_COMMAND,
  HOOK_MATCHER as CLAUDE_HOOK_MATCHER,
} from "@harnesstrim/adapter-claude";
import { REDUCE_INSTRUCTION_SNIPPET as CODEX_SNIPPET } from "@harnesstrim/adapter-codex";
import { DEFAULT_HERMES_ADAPTER_CONFIG, bakeHermesConfig } from "@harnesstrim/adapter-hermes";
import { DEFAULT_PI_ADAPTER_CONFIG, bakePiConfig } from "@harnesstrim/adapter-pi";
import { DEFAULT_OMP_ADAPTER_CONFIG, bakeOmpConfig } from "@harnesstrim/adapter-omp";
import {
  buildOpencodeWrapper,
  buildOpencodePackageJson,
  DEFAULT_OPENCODE_ADAPTER_CONFIG,
} from "./install.ts";
import { resolveSkillsSourceDir, listShippedSkills } from "./skills-source.ts";
import {
  resolveHermesPluginSourceDir,
  resolvePiExtensionSourceDir,
  resolveOmpHookSourceDir,
} from "./assets.ts";

/**
 * Per-artifact SHA-256 digests for `harnesstrim capabilities`.
 *
 * `writeSet` lists what `install <harness>` writes; `digests` pins the CONTENT this
 * version would place there. A consumer (Token Harness, a CI gate, a second install
 * site) hashes its copy and compares against this table instead of re-deriving or
 * hardcoding a per-version table by hand — the `upstreamVersion: '0.0.7'` hand-pin
 * use case. Only content this release fully owns is digested:
 *   - shipped asset files (skill pack, Hermes plugin bundle, Pi extension, OMP hook)
 *   - generated-but-deterministic files (OpenCode wrapper + package.json for the
 *     default options, baked adapter config files)
 *   - marker-guarded snippets (CLAUDE.md / AGENTS.md reduce-pipe instructions)
 * Merged user files (settings.json, CLAUDE.md, AGENTS.md themselves) are NOT digested
 * wholesale — only the owned fragment is, under a `(marker-guarded snippet)`-style key.
 *
 * Paths are relative to the install dir (project scope where scopes exist) and use
 * forward slashes, so digests are portable across OSes.
 */

export type HarnessDigests = Record<string, string>;

/** SHA-256 (hex) of a UTF-8 string or byte buffer. */
export function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function hashFile(p: string): string {
  return sha256(fs.readFileSync(p));
}

/** Hash every file under `root` recursively, keyed by `<prefix>/<relpath>` (forward slashes). */
function hashTree(root: string, prefix: string): HarnessDigests {
  const out: HarnessDigests = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, relPath);
      else out[`${prefix}/${relPath}`] = hashFile(abs);
    }
  };
  if (!fs.existsSync(root)) return out;
  walk(root, "");
  return out;
}

/** Digests for the shared skill pack, installed under `destRel` (claude/codex). */
function skillDigests(destRel: string): HarnessDigests {
  const sourceDir = resolveSkillsSourceDir();
  const out: HarnessDigests = {};
  for (const name of listShippedSkills(sourceDir)) {
    Object.assign(out, hashTree(path.join(sourceDir, name), `${destRel}/${name}`));
  }
  return out;
}

const CLAUDE_HOOK_ENTRY = {
  matcher: CLAUDE_HOOK_MATCHER,
  hooks: [{ type: "command", command: CLAUDE_HOOK_COMMAND }],
};

/**
 * Compute the digest tables for every harness in THIS version of the CLI. Resolves
 * the shipped sources the installers read (same resolver as `install`, so the digest
 * always matches the bytes an apply would place). Deterministic per version.
 */
export function computeHarnessDigests(): Record<string, HarnessDigests> {
  const digests: Record<string, HarnessDigests> = {};

  digests.opencode = {
    ".opencode/plugin/harnesstrim.ts": sha256(buildOpencodeWrapper(DEFAULT_OPENCODE_ADAPTER_CONFIG)),
    ".opencode/package.json": sha256(buildOpencodePackageJson(null)),
  };

  digests.codex = {
    ...skillDigests(".codex/skills"),
    "AGENTS.md (marker-guarded snippet)": sha256(CODEX_SNIPPET),
  };

  digests.claude = {
    ...skillDigests(".claude/skills"),
    "CLAUDE.md (marker-guarded snippet)": sha256(CLAUDE_SNIPPET),
    ".claude/settings.json (hook entry)": sha256(JSON.stringify(CLAUDE_HOOK_ENTRY)),
  };

  digests.hermes = hashTree(
    resolveHermesPluginSourceDir(),
    ".hermes/plugins/harnesstrim"
  );
  digests.hermes[".hermes/plugins/harnesstrim/config.json"] = sha256(bakeHermesConfig(DEFAULT_HERMES_ADAPTER_CONFIG));

  digests.pi = hashTree(
    resolvePiExtensionSourceDir(),
    ".pi/extensions/harnesstrim"
  );
  digests.pi[".pi/extensions/harnesstrim/config.json"] = sha256(bakePiConfig(DEFAULT_PI_ADAPTER_CONFIG));

  digests.omp = hashTree(
    resolveOmpHookSourceDir(),
    ".omp/hooks/post"
  );
  digests.omp[".omp/hooks/harnesstrim.json"] = sha256(bakeOmpConfig(DEFAULT_OMP_ADAPTER_CONFIG));

  return digests;
}

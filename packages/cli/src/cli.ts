#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPreset, listPresets, makeTrimEvent, DEFAULT_MIN_LENGTH } from "@harnesstrim/core";
import { inspect } from "./doctor.ts";
import { runInstallOpencode } from "./install.ts";
import { runInstallCodex, runInstallCodexGlobalHook } from "./install-codex.ts";
import { runInstallClaude } from "./install-claude.ts";
import { runInstallPi } from "./install-pi.ts";
import { runInstallHermes } from "./install-hermes.ts";
import { runInstallOmp } from "./install-omp.ts";
import { countTokens } from "./tokens.ts";
import { reduceClaudePayload } from "@harnesstrim/adapter-claude";
import { reduceCodexPayload } from "@harnesstrim/adapter-codex";
import { loadMetrics, DEFAULT_METRICS_PATH } from "./metrics.ts";
import pkg from "../package.json" with { type: "json" };

import { readStdin, reducePipe } from "./reduce.ts";
import { getCapabilities } from "./capabilities.ts";
import { planUninstall, runUninstall } from "./uninstall.ts";
import {
  renderDoctor,
  renderInstall,
  renderCodexInstall,
  renderCodexGlobalHookInstall,
  renderClaudeInstall,
  renderHermesInstall,
  renderPiInstall,
  renderOmpInstall,
  renderMetrics,
  renderPresetList,
  renderPresetShow,
  renderUninstall,
} from "./render.ts";
import {
  doctorJson,
  metricsJson,
  opencodeInstallJson,
  codexInstallJson,
  claudeInstallJson,
  hermesInstallJson,
  piInstallJson,
  ompInstallJson,
  codexGlobalHookJson,
} from "./json.ts";

const HELP = `harnesstrim — one token policy for coding harnesses

Usage:
  harnesstrim doctor [dir]                 Diagnose token-waste signals in a project
  harnesstrim install opencode [dir]       Wire the adapter into opencode.json (dry-run)
                            --apply         Actually write the change
                            --preset <name> Bake a policy preset's adapter config in
                            --mode <m>      Override mode: active|dryrun|off
                            --min-length <n> Override the reduction threshold (chars)
                            --tools <list>  Confine reduction to a subset of tool families
  harnesstrim install codex [dir]          Install skills + AGENTS.md reduction guidance (dry-run)
                            --apply         Actually write the change
                            --hook          Also install the experimental Bash PostToolUse hook
                            --no-instructions  Skills only (no AGENTS.md reduce-pipe instruction)
                            --global        With --hook, install it once in ~/.codex (no project files)
  harnesstrim install claude [dir]         Install skills + PostToolUse reducer hook (dry-run)
                            --apply         Actually write the change
                            --no-hook       Skills only (no PostToolUse hook)
                            --no-instructions  Skills only (no CLAUDE.md reduce-pipe instruction)
  harnesstrim install hermes [dir]         Install Hermes plugin (dry-run)
                            --apply         Actually write the change
                            --mode <m>      Bake mode: active|dryrun|off (env still wins)
                            --min-length <n> Bake the min threshold (chars)
                            --no-enable      Copy plugin only; do not edit Hermes config.yaml
  harnesstrim install pi [dir]             Install Pi tool_result extension (dry-run)
                            --apply         Actually write the change
                            --mode <m>      Bake mode: active|dryrun|off (env still wins)
                            --min-length <n> Bake the min threshold (chars)
                            --metrics <p>   Record a TrimEvent JSONL receipt per reduction
  harnesstrim install omp [dir]            Install OMP tool_result hook (dry-run)
                            --apply         Actually write the change
                            --mode <m>      Bake mode: active|dryrun|off (env still wins)
                            --min-length <n> Bake the min threshold (chars)
                            --metrics <p>   Record a TrimEvent JSONL receipt per reduction
  harnesstrim uninstall <harness> [dir]    Remove only what install wrote (dry-run)
                            --apply         Actually write the change
  harnesstrim capabilities                 Print machine-readable per-harness capabilities (JSON)
  harnesstrim hook claude [--metrics <path>]
                                           PostToolUse hook runtime; --metrics records a TrimEvent per reduction
  harnesstrim hook codex [--metrics <path>]
                                           PostToolUse runtime for Codex's experimental Bash hook
  harnesstrim preset list                  List policy presets
  harnesstrim preset show <name>           Show a preset in detail
  harnesstrim metrics [path]               Summarize adapter telemetry (JSONL)
  harnesstrim reduce [--stats] [--metrics <path>]
                                           Slim stdin -> stdout (pipe noisy command output);
                                           --metrics records a TrimEvent per reduction
  harnesstrim mcp [--metrics <path>]       Start the MCP server (stdio) exposing a reduce tool;
                                           --metrics records a TrimEvent per reduction
  harnesstrim bench                        Run the Tier A reducer micro-benchmark
  harnesstrim --version                    Print the installed version

Flags:
  --json                                  Print machine-readable JSON (doctor, metrics, install, uninstall)

Notes:
  - install and uninstall are dry-run by default; nothing is written without --apply.
  - dir defaults to the current directory; metrics path defaults to ${DEFAULT_METRICS_PATH}.
  - reduce reads stdin and writes slimmed output to stdout, e.g.  npm test 2>&1 | harnesstrim reduce`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      apply: { type: "boolean" },
      preset: { type: "string" },
      stats: { type: "boolean" },
      "min-length": { type: "string" },
      log: { type: "string" },
      metrics: { type: "string" },
      hook: { type: "boolean" },
      global: { type: "boolean" },
      "no-hook": { type: "boolean" },
      "no-instructions": { type: "boolean" },
      "no-enable": { type: "boolean" },
      mode: { type: "string" },
      tools: { type: "string" },
      json: { type: "boolean" },
    },
  });

  const [command, ...rest] = positionals;

  if (values.version) {
    console.log(pkg.version);
    return 0;
  }

  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "doctor": {
      const dir = rest[0] ?? process.cwd();
      const report = inspect(dir);
      if (values.json) {
        console.log(doctorJson(report));
      } else {
        console.log(renderDoctor(report));
      }
      return 0;
    }
    case "install": {
      const target = rest[0];
      // Hermes and OMP use their user-level home by default; other adapters keep
      // their project-directory default. Pass an explicit directory for a
      // project-local or alternate-profile installation.
      const dir = rest[1] ?? (target === "hermes" || target === "omp" ? os.homedir() : process.cwd());
      const apply = values.apply === true;
      const asJson = values.json === true;
      if (target === "opencode") {
        const mode = parseModeFlag(values.mode);
        if (mode === undefined && values.mode !== undefined) {
          console.error(`Invalid --mode: ${values.mode} (expected active, dryrun, or off).`);
          return 1;
        }
        const minLength = values["min-length"] !== undefined ? Number(values["min-length"]) : undefined;
        if (minLength !== undefined && !Number.isFinite(minLength)) {
          console.error(`Invalid --min-length: ${values["min-length"]}`);
          return 1;
        }
        const tools = values.tools !== undefined ? splitTools(values.tools) : undefined;
        const result = runInstallOpencode(dir, apply, values.preset, true, { mode, minLength, tools });
        if (asJson) console.log(JSON.stringify(opencodeInstallJson(result, apply), null, 2));
        else console.log(renderInstall(result, apply));
        return 0;
      }
      if (target === "codex") {
        if (values.global === true) {
          if (values.hook !== true) {
            console.error("`harnesstrim install codex --global` requires `--hook`.");
            return 1;
          }
          const result = runInstallCodexGlobalHook(path.join(os.homedir(), ".codex"), apply);
          if (asJson) console.log(JSON.stringify(codexGlobalHookJson(result, apply), null, 2));
          else console.log(renderCodexGlobalHookInstall(result, apply));
          return 0;
        }
        const result = runInstallCodex(dir, apply, values.hook === true, {
          includeInstructions: values["no-instructions"] !== true,
        });
        if (asJson) console.log(JSON.stringify(codexInstallJson(result, apply), null, 2));
        else console.log(renderCodexInstall(result, apply));
        return 0;
      }
      if (target === "claude") {
        const result = runInstallClaude(dir, apply, {
          includeHook: values["no-hook"] !== true,
          includeInstructions: values["no-instructions"] !== true,
        });
        if (asJson) console.log(JSON.stringify(claudeInstallJson(result, apply), null, 2));
        else console.log(renderClaudeInstall(result, apply));
        return 0;
      }
      if (target === "hermes") {
        const mode = parseModeFlag(values.mode);
        if (mode === undefined && values.mode !== undefined) {
          console.error(`Invalid --mode: ${values.mode} (expected active, dryrun, or off).`);
          return 1;
        }
        const minLength = parseLengthFlag(values["min-length"]);
        if (minLength === undefined && values["min-length"] !== undefined) {
          console.error(`Invalid --min-length: ${values["min-length"]}`);
          return 1;
        }
        const result = runInstallHermes(dir, apply, {
          mode,
          minLength,
          enable: values["no-enable"] !== true,
        });
        if (asJson) console.log(JSON.stringify(hermesInstallJson(result, apply), null, 2));
        else console.log(renderHermesInstall(result, apply));
        return 0;
      }
      if (target === "pi") {
        const mode = parseModeFlag(values.mode);
        if (mode === undefined && values.mode !== undefined) {
          console.error(`Invalid --mode: ${values.mode} (expected active, dryrun, or off).`);
          return 1;
        }
        const minLength = parseLengthFlag(values["min-length"]);
        if (minLength === undefined && values["min-length"] !== undefined) {
          console.error(`Invalid --min-length: ${values["min-length"]}`);
          return 1;
        }
        const result = runInstallPi(dir, apply, { mode, minLength, metrics: values.metrics });
        if (asJson) console.log(JSON.stringify(piInstallJson(result, apply), null, 2));
        else console.log(renderPiInstall(result, apply));
        return 0;
      }
      if (target === "omp") {
        const mode = parseModeFlag(values.mode);
        if (mode === undefined && values.mode !== undefined) {
          console.error(`Invalid --mode: ${values.mode} (expected active, dryrun, or off).`);
          return 1;
        }
        const minLength = parseLengthFlag(values["min-length"]);
        if (minLength === undefined && values["min-length"] !== undefined) {
          console.error(`Invalid --min-length: ${values["min-length"]}`);
          return 1;
        }
        const result = runInstallOmp(dir, apply, { mode, minLength, metrics: values.metrics });
        if (asJson) console.log(JSON.stringify(ompInstallJson(result, apply), null, 2));
        else console.log(renderOmpInstall(result, apply));
        return 0;
      }
      console.error(`Unknown install target: ${target ?? "(none)"}. Supported: opencode, codex, claude, hermes, pi, omp.`);
      return 1;
    }
    case "uninstall": {
      const target = rest[0];
      const dir = rest[1] ?? (target === "hermes" || target === "omp" ? os.homedir() : process.cwd());
      const apply = values.apply === true;
      try {
        const result = runUninstall(target, dir, apply);
        if (values.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderUninstall(result, apply));
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
      return 0;
    }
    case "capabilities": {
      console.log(JSON.stringify(getCapabilities(pkg.version), null, 2));
      return 0;
    }
    case "hook": {
      const which = rest[0];
      if (which !== "claude" && which !== "codex") {
        console.error(`Unknown hook target: ${which ?? "(none)"}. Supported: claude, codex.`);
        return 1;
      }
      const input = await readStdin();
      const { response, event, attempt } =
        which === "claude" ? reduceClaudePayload(input) : reduceCodexPayload(input);
      process.stdout.write(response);
      // --metrics <path>: append a TrimEvent per reduction, read by `harnesstrim metrics`.
      // Pass-throughs (attempted but unchanged) are recorded too, per HARNESSTRIM_TRACK_PASSTHROUGH
      // (default on), so the metrics pass-through rate is meaningful.
      if (values.metrics) {
        try {
          const p = path.resolve(values.metrics);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          if (event) {
            fs.appendFileSync(
              p,
              JSON.stringify(
                makeTrimEvent({
                  ts: new Date().toISOString(),
                  harness: which,
                  ...event,
                })
              ) + "\n"
            );
          } else if (attempt && trackPassThrough()) {
            fs.appendFileSync(
              p,
              JSON.stringify(
                makeTrimEvent({
                  ts: new Date().toISOString(),
                  harness: which,
                  tool: attempt.tool,
                  reducer: null,
                  beforeChars: attempt.beforeChars,
                  afterChars: attempt.beforeChars,
                  changed: false,
                })
              ) + "\n"
            );
          }
        } catch {
          /* telemetry must never break the hook */
        }
      }
      // --log <path>: lightweight debug line (input size, whether it changed).
      if (values.log) {
        try {
          fs.appendFileSync(
            values.log,
            JSON.stringify({ inputChars: input.length, changed: response !== "{}", responseChars: response.length }) + "\n"
          );
        } catch {
          /* logging must never break the hook */
        }
      }
      return 0;
    }
    case "preset": {
      const sub = rest[0];
      if (sub === "list" || sub === undefined) {
        console.log(renderPresetList(listPresets()));
        return 0;
      }
      if (sub === "show") {
        const name = rest[1];
        const preset = name ? getPreset(name) : undefined;
        if (!preset) {
          console.error(`Unknown preset: ${name ?? "(none)"}. Try \`harnesstrim preset list\`.`);
          return 1;
        }
        console.log(renderPresetShow(preset));
        return 0;
      }
      console.error(`Unknown preset subcommand: ${sub}. Use \`list\` or \`show <name>\`.`);
      return 1;
    }
    case "metrics": {
      const path = rest[0] ?? DEFAULT_METRICS_PATH;
      const result = loadMetrics(path);
      if (values.json) {
        console.log(metricsJson(result));
      } else {
        console.log(renderMetrics(result));
      }
      return 0;
    }
    case "reduce": {
      const minLenRaw = values["min-length"];
      const minLength = minLenRaw !== undefined ? Number(minLenRaw) : undefined;
      if (minLength !== undefined && !Number.isFinite(minLength)) {
        console.error(`Invalid --min-length: ${minLenRaw}`);
        return 1;
      }
      const input = await readStdin();
      const result = reducePipe(input, minLength);
      process.stdout.write(result.output);
      // --metrics <path>: append a TrimEvent per reduction, read by `harnesstrim metrics`.
      // Pass-throughs (attempted but unchanged) are recorded too, per HARNESSTRIM_TRACK_PASSTHROUGH
      // (default on), so the metrics pass-through rate is meaningful. This path is a standalone
      // process (not inside a harness), so it also reports exact token counts (see tokens.ts).
      if (values.metrics) {
        try {
          const p = path.resolve(values.metrics);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          if (result.changed) {
            fs.appendFileSync(
              p,
              JSON.stringify(
                makeTrimEvent({
                  ts: new Date().toISOString(),
                  harness: "pipe",
                  tool: "reduce",
                  reducer: result.reducer,
                  beforeChars: result.beforeChars,
                  afterChars: result.afterChars,
                  beforeTokens: countTokens(input),
                  afterTokens: countTokens(result.output),
                })
              ) + "\n"
            );
          } else if (trackPassThrough() && input.length >= (minLength ?? DEFAULT_MIN_LENGTH)) {
            fs.appendFileSync(
              p,
              JSON.stringify(
                makeTrimEvent({
                  ts: new Date().toISOString(),
                  harness: "pipe",
                  tool: "reduce",
                  reducer: null,
                  beforeChars: input.length,
                  afterChars: input.length,
                  changed: false,
                  beforeTokens: countTokens(input),
                  afterTokens: countTokens(input),
                })
              ) + "\n"
            );
          }
        } catch {
          /* telemetry must never break the pipe */
        }
      }
      if (values.stats) {
        const note = result.changed
          ? `${result.reducer}: ${result.beforeChars} -> ${result.afterChars} chars`
          : "no reduction (no reducer matched or below min-length)";
        console.error(`[harnesstrim reduce] ${note}`);
      }
      return 0;
    }
    case "mcp": {
      const { startStdioServer } = await import("@harnesstrim/mcp");
      // --metrics <path> records a TrimEvent per reduction (read with `harnesstrim metrics`).
      // The MCP server is a standalone process (unlike harness adapters), so token counts
      // are passed in for exact before/after token reporting (see tokens.ts).
      await startStdioServer(values.metrics ? { metricsPath: values.metrics, countTokens } : { countTokens });
      // startStdioServer resolves once connected; keep the process alive for stdio.
      await new Promise<never>(() => {});
      return 0;
    }
    case "bench": {
      // The Tier A micro-benchmark runs against the repo's fixtures and writes a
      // report back into the repo — it's a monorepo-development tool, kept out of the
      // published bundle (see build.mjs). In a standalone install the import fails
      // (ERR_MODULE_NOT_FOUND); from a stray location the fixtures are missing
      // (ENOENT). Either way, degrade with a clear message instead of a raw stack.
      try {
        const { runBench } = await import("@harnesstrim/benchmarks/run");
        runBench();
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "ENOENT" || code === "ERR_MODULE_NOT_FOUND") {
          console.error(
            "harnesstrim bench is a repository-development command (it reads the benchmark\n" +
              "fixtures and writes a report). Run it from a HarnessTrim checkout:\n" +
              "  git clone https://github.com/giuliastro/HarnessTrim && pnpm install && pnpm exec harnesstrim bench"
          );
          return 1;
        }
        throw err;
      }
      return 0;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      return 1;
  }
}

/** Parse `--mode` into the adapter's Mode union; undefined when unset or invalid. */
function parseModeFlag(value: string | undefined): "active" | "dryrun" | "off" | undefined {
  return value === "active" || value === "dryrun" || value === "off" ? value : undefined;
}

/**
 * Parse `--min-length` into a positive finite number; undefined when unset or invalid.
 * Zero is rejected rather than accepted: the adapters treat a baked `minLength` of 0 as
 * absent and fall back to their 400-char default, so baking it would report a threshold
 * the runtime never honors.
 */
function parseLengthFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Split a comma-separated `--tools` value into trimmed tool names. */
function splitTools(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Whether pass-through (attempted-but-unchanged) events should be recorded alongside
 * reductions. Reads HARNESSTRIM_TRACK_PASSTHROUGH; default on ("0" or "false" opts out).
 */
function trackPassThrough(): boolean {
  const v = process.env.HARNESSTRIM_TRACK_PASSTHROUGH;
  return v === undefined || (v !== "0" && v !== "false");
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`harnesstrim: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });

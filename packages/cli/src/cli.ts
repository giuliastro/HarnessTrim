#!/usr/bin/env node
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPreset, listPresets } from "@harnesstrim/core";
import { inspect } from "./doctor.ts";
import { runInstallOpencode } from "./install.ts";
import { runInstallCodex, runInstallCodexGlobalHook } from "./install-codex.ts";
import { runInstallClaude } from "./install-claude.ts";
import { runInstallPi } from "./install-pi.ts";
import { runInstallHermes } from "./install-hermes.ts";
import { reduceClaudePayload } from "@harnesstrim/adapter-claude";
import { reduceCodexPayload } from "@harnesstrim/adapter-codex";
import { loadMetrics, DEFAULT_METRICS_PATH } from "./metrics.ts";
import { readStdin, reducePipe } from "./reduce.ts";
import {
  renderDoctor,
  renderInstall,
  renderCodexInstall,
  renderCodexGlobalHookInstall,
  renderClaudeInstall,
  renderHermesInstall,
  renderPiInstall,
  renderMetrics,
  renderPresetList,
  renderPresetShow,
} from "./render.ts";

const HELP = `harnesstrim — one token policy for coding harnesses

Usage:
  harnesstrim doctor [dir]                 Diagnose token-waste signals in a project
  harnesstrim install opencode [dir]       Wire the adapter into opencode.json (dry-run)
                            --apply         Actually write the change
                            --preset <name> Bake a policy preset's adapter config in
  harnesstrim install codex [dir]          Install skills + AGENTS.md reduction guidance (dry-run)
                            --apply         Actually write the change
                            --hook          Also install the experimental Bash PostToolUse hook
                            --global        With --hook, install it once in ~/.codex (no project files)
  harnesstrim install claude [dir]         Install skills + PostToolUse reducer hook (dry-run)
                            --apply         Actually write the change
  harnesstrim install hermes [dir]         Install Hermes plugin (dry-run)
                            --apply         Actually write the change
  harnesstrim install pi [dir]             Install Pi tool_result extension (dry-run)
                            --apply         Actually write the change
  harnesstrim hook claude [--metrics <path>]
                                           PostToolUse hook runtime; --metrics records a TrimEvent per reduction
  harnesstrim hook codex [--metrics <path>]
                                           PostToolUse runtime for Codex's experimental Bash hook
  harnesstrim preset list                  List policy presets
  harnesstrim preset show <name>           Show a preset in detail
  harnesstrim metrics [path]               Summarize adapter telemetry (JSONL)
  harnesstrim reduce [--stats]             Slim stdin -> stdout (pipe noisy command output)
  harnesstrim mcp                          Start the MCP server (stdio) exposing a reduce tool
  harnesstrim bench                        Run the Tier A reducer micro-benchmark
  harnesstrim --help                       Show this help

Notes:
  - install is dry-run by default; nothing is written without --apply.
  - dir defaults to the current directory; metrics path defaults to ${DEFAULT_METRICS_PATH}.
  - reduce reads stdin and writes slimmed output to stdout, e.g.  npm test 2>&1 | harnesstrim reduce`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      apply: { type: "boolean" },
      preset: { type: "string" },
      stats: { type: "boolean" },
      "min-length": { type: "string" },
      log: { type: "string" },
      metrics: { type: "string" },
      hook: { type: "boolean" },
      global: { type: "boolean" },
    },
  });

  const [command, ...rest] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "doctor": {
      const dir = rest[0] ?? process.cwd();
      console.log(renderDoctor(inspect(dir)));
      return 0;
    }
    case "install": {
      const target = rest[0];
      // Hermes uses the user-level Hermes home by default; other adapters keep
      // their project-directory default. Pass an explicit directory for a
      // project-local or alternate-profile installation.
      const dir = rest[1] ?? (target === "hermes" ? os.homedir() : process.cwd());
      const apply = values.apply === true;
      if (target === "opencode") {
        const result = runInstallOpencode(dir, apply, values.preset);
        console.log(renderInstall(result, apply));
        return 0;
      }
      if (target === "codex") {
        if (values.global === true) {
          if (values.hook !== true) {
            console.error("`harnesstrim install codex --global` requires `--hook`.");
            return 1;
          }
          console.log(renderCodexGlobalHookInstall(runInstallCodexGlobalHook(path.join(os.homedir(), ".codex"), apply), apply));
          return 0;
        }
        console.log(renderCodexInstall(runInstallCodex(dir, apply, values.hook === true), apply));
        return 0;
      }
      if (target === "claude") {
        console.log(renderClaudeInstall(runInstallClaude(dir, apply), apply));
        return 0;
      }
      if (target === "hermes") {
        console.log(renderHermesInstall(runInstallHermes(dir, apply), apply));
        return 0;
      }
      if (target === "pi") {
        console.log(renderPiInstall(runInstallPi(dir, apply), apply));
        return 0;
      }
      console.error(`Unknown install target: ${target ?? "(none)"}. Supported: opencode, codex, claude, hermes, pi.`);
      return 1;
    }
    case "hook": {
      const which = rest[0];
      if (which !== "claude" && which !== "codex") {
        console.error(`Unknown hook target: ${which ?? "(none)"}. Supported: claude, codex.`);
        return 1;
      }
      const input = await readStdin();
      const { response, event } = which === "claude" ? reduceClaudePayload(input) : reduceCodexPayload(input);
      process.stdout.write(response);
      // --metrics <path>: append a TrimEvent per reduction, read by `harnesstrim metrics`.
      if (values.metrics && event) {
        try {
          const p = path.resolve(values.metrics);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.appendFileSync(
            p,
            JSON.stringify({ ts: new Date().toISOString(), harness: which, ...event }) + "\n"
          );
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
      console.log(renderMetrics(loadMetrics(path)));
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
      await startStdioServer();
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

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`harnesstrim: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });

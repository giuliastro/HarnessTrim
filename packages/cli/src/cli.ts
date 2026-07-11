#!/usr/bin/env node
import { parseArgs } from "node:util";
import { getPreset, listPresets } from "@harnesstrim/core";
import { inspect } from "./doctor.ts";
import { runInstallOpencode } from "./install.ts";
import { loadMetrics, DEFAULT_METRICS_PATH } from "./metrics.ts";
import {
  renderDoctor,
  renderInstall,
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
  harnesstrim preset list                  List policy presets
  harnesstrim preset show <name>           Show a preset in detail
  harnesstrim metrics [path]               Summarize adapter telemetry (JSONL)
  harnesstrim bench                        Run the Tier A reducer micro-benchmark
  harnesstrim --help                       Show this help

Notes:
  - install is dry-run by default; nothing is written without --apply.
  - dir defaults to the current directory; metrics path defaults to ${DEFAULT_METRICS_PATH}.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      apply: { type: "boolean" },
      preset: { type: "string" },
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
      if (target !== "opencode") {
        console.error(`Unknown install target: ${target ?? "(none)"}. Supported: opencode.`);
        return 1;
      }
      const dir = rest[1] ?? process.cwd();
      const result = runInstallOpencode(dir, values.apply === true, values.preset);
      console.log(renderInstall(result, values.apply === true));
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
    case "bench": {
      const { runBench } = await import("@harnesstrim/benchmarks/run");
      runBench();
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

#!/usr/bin/env node
import { parseArgs } from "node:util";
import { inspect } from "./doctor.ts";
import { runInstallOpencode } from "./install.ts";
import { renderDoctor, renderInstall } from "./render.ts";

const HELP = `harnesstrim — one token policy for coding harnesses

Usage:
  harnesstrim doctor [dir]              Diagnose token-waste signals in a project
  harnesstrim install opencode [dir]   Wire the adapter into opencode.json (dry-run)
                            --apply     Actually write the change
  harnesstrim bench                     Run the Tier A reducer micro-benchmark
  harnesstrim --help                    Show this help

Notes:
  - install is dry-run by default; nothing is written without --apply.
  - dir defaults to the current directory.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      apply: { type: "boolean" },
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
      const result = runInstallOpencode(dir, values.apply === true);
      console.log(renderInstall(result, values.apply === true));
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

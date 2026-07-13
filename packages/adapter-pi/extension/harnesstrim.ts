// HarnessTrim Pi extension — slims noisy tool output via the `tool_result` hook.
//
// Pi fires `tool_result` after a tool finishes and before the result reaches the model;
// handlers chain like middleware and may return a patch ({ content, details, isError }).
// This extension reduces string `content` for noisy output (test runners, git diffs, ...)
// by shelling out to `harnesstrim reduce`, so it is self-contained (no workspace imports)
// and loads from `~/.pi/agent/extensions/` or `<project>/.pi/extensions/`.
//
// Requires `harnesstrim` on PATH; if it is missing or fails, the output is passed through
// unchanged (a reducer must never break a tool result). Config via env:
//   HARNESSTRIM_MODE=dryrun|active|off   (default dryrun — logs, does not mutate)
//   HARNESSTRIM_MINLENGTH=<chars>        (default 400)
import { spawnSync } from "node:child_process";

interface ToolResultEvent {
  content?: unknown;
  isError?: boolean;
}
interface ExtensionAPI {
  on(event: string, handler: (event: ToolResultEvent, ctx: unknown) => unknown): void;
}

const env = globalThis.process?.env ?? {};
const MODE = env.HARNESSTRIM_MODE ?? "dryrun";
const MIN_LENGTH = Number(env.HARNESSTRIM_MINLENGTH ?? "400") || 400;
const MARKER = "[harnesstrim";

function reduceViaCli(text: string): string | null {
  try {
    const r = spawnSync("harnesstrim", ["reduce", "--min-length", String(MIN_LENGTH)], {
      input: text,
      encoding: "utf8",
      timeout: 30000,
    });
    if (r.status === 0 && typeof r.stdout === "string" && r.stdout.length > 0) {
      return r.stdout.replace(/\n$/, "");
    }
  } catch {
    /* harnesstrim not on PATH or failed — pass through */
  }
  return null;
}

export default function harnesstrim(pi: ExtensionAPI): void {
  if (MODE === "off") return;
  pi.on("tool_result", async (event) => {
    const content = event.content;
    if (typeof content !== "string" || content.length < MIN_LENGTH) return;
    if (content.includes(MARKER)) return; // already reduced — avoid double work

    const reduced = reduceViaCli(content);
    if (!reduced || reduced.length >= content.length) return;

    if (MODE === "dryrun") {
      globalThis.process?.stderr?.write(
        `[harnesstrim] dryrun tool_result: ${content.length} -> ${reduced.length} chars\n`
      );
      return; // dryrun: observe only
    }
    return { content: reduced }; // active: patch the tool result the model sees
  });
}

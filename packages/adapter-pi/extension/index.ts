// HarnessTrim Pi extension — slims noisy tool output via the `tool_result` hook.
//
// Pi fires `tool_result` after a tool finishes and before the result reaches the model;
// handlers chain like middleware and may return a patch ({ content, details, isError }).
// This extension reduces text chunks in structured tool results (test runners, git diffs, ...)
// by shelling out to `harnesstrim reduce`, so it is self-contained (no workspace imports)
// and loads from `~/.pi/agent/extensions/` or `<project>/.pi/extensions/`.
//
// Requires `harnesstrim` on PATH; if it is missing or fails, the output is passed through
// unchanged (a reducer must never break a tool result). Config via env:
//   HARNESSTRIM_MODE=dryrun|active|off   (default dryrun — logs, does not mutate)
//   HARNESSTRIM_MINLENGTH=<chars>        (default 400)
import { spawnSync } from "node:child_process";

type TextContent = { type: "text"; text: string };
type ToolContent = TextContent | { type: string; [key: string]: unknown };

interface ToolResultEvent {
  content?: ToolContent[];
  isError?: boolean;
}
interface ExtensionAPI {
  on(event: string, handler: (event: ToolResultEvent, ctx: unknown) => unknown): void;
}

const runtime = globalThis as typeof globalThis & { process?: NodeJS.Process };
const env = runtime.process?.env ?? {};
const MODE = env.HARNESSTRIM_MODE ?? "dryrun";
const MIN_LENGTH = Number(env.HARNESSTRIM_MINLENGTH ?? "400") || 400;
const MARKER = "[harnesstrim";

/** True when a text chunk should not be reduced: too short, or already reduced. */
export function shouldSkip(text: string, minLength: number): boolean {
  return text.length < minLength || text.includes(MARKER);
}

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
    if (!Array.isArray(event.content)) return;

    let changed = false;
    const content = event.content.map((chunk) => {
      if (chunk.type !== "text" || typeof chunk.text !== "string") return chunk;
      const text = chunk.text;
      if (shouldSkip(text, MIN_LENGTH)) return chunk;

      const reduced = reduceViaCli(text);
      if (!reduced || reduced.length >= text.length) return chunk;

      if (MODE === "dryrun") {
        runtime.process?.stderr?.write(
          `[harnesstrim] dryrun tool_result: ${text.length} -> ${reduced.length} chars\n`
        );
        return chunk;
      }

      changed = true;
      return { ...chunk, text: reduced };
    });

    return changed ? { content } : undefined;
  });
}

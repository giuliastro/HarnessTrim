import fs from "node:fs";
import path from "node:path";
import type { TrimEvent } from "@harnesstrim/core";

export type EventSink = (event: TrimEvent) => void;

/** A sink that discards events — used when telemetry is off (the default). */
export const noopSink: EventSink = () => {};

/**
 * A sink that appends each event as one JSON line to `filePath`, creating parent
 * directories as needed. Failures are swallowed: telemetry must never break the
 * harness. Relative paths resolve against the current working directory.
 */
export function createFileSink(filePath: string): EventSink {
  const resolved = path.resolve(filePath);
  return (event: TrimEvent) => {
    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.appendFileSync(resolved, JSON.stringify(event) + "\n");
    } catch {
      /* ignore telemetry write errors */
    }
  };
}

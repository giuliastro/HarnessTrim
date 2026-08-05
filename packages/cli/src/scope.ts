import os from "node:os";
import path from "node:path";

/**
 * Install scope resolution, shared by every installer and uninstaller that has a
 * user-level and a project-level layout (pi, omp).
 *
 * This lives in one place on purpose. It used to be inlined at each call site, and the
 * copies drifted: the installers resolved the home directory with `os.homedir()` while
 * the uninstallers used `process.env.HOME`. Those agree on POSIX (`os.homedir()` reads
 * `$HOME` when set) but not on Windows, where `HOME` is usually unset outside a POSIX
 * shell — `path.resolve("")` then collapses to the cwd and the scope flips both ways,
 * so `uninstall` looked for a layout `install` never wrote and silently found nothing.
 *
 * `home` is injectable so tests can pin both scopes without moving the real home
 * directory (which is not possible via `HOME` on Windows, nor safe on POSIX).
 */
export type InstallScope = "user" | "project";

/** `user` when `dir` is the home directory itself, `project` otherwise. */
export function scopeOf(dir: string, home: string = os.homedir()): InstallScope {
  return path.resolve(dir) === path.resolve(home) ? "user" : "project";
}

/** The Pi extension directory for `dir`: `.pi/agent/extensions/` at user scope. */
export function piExtensionDir(dir: string, home?: string): string {
  return scopeOf(dir, home) === "user"
    ? path.join(dir, ".pi", "agent", "extensions", "harnesstrim")
    : path.join(dir, ".pi", "extensions", "harnesstrim");
}

/**
 * The OMP hooks directory for `dir`: `.omp/agent/hooks/` at user scope. The hook file
 * goes in `post/` below this; the baked config sits here, outside `post/`, so omp's
 * loader never treats it as a hook.
 */
export function ompHooksDir(dir: string, home?: string): string {
  return scopeOf(dir, home) === "user"
    ? path.join(dir, ".omp", "agent", "hooks")
    : path.join(dir, ".omp", "hooks");
}

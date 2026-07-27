import { homedir } from "node:os";
import { join } from "node:path";
import type { StatePaths } from "./types.ts";

/** Returns manager-owned locations without creating them. */
export function resolveStatePaths(environment: NodeJS.ProcessEnv = process.env): StatePaths {
  const home = environment.HOME ?? homedir();
  const stateHome = environment.XDG_STATE_HOME ?? join(home, ".local", "state");
  // macOS's TMPDIR is long enough to exceed its Unix-socket path limit once a
  // workspace UUID is appended. /tmp keeps the private, per-user directory
  // short; ensurePrivateDirectory applies mode 0700 before it is used.
  const runtimeHome = environment.XDG_RUNTIME_DIR ?? join("/tmp", `piw-${process.getuid?.() ?? "user"}`);
  const stateDirectory = join(stateHome, "pi-workspaces");
  return {
    stateDirectory,
    databasePath: join(stateDirectory, "state.db"),
    runtimeDirectory: join(runtimeHome, "runtime"),
  };
}

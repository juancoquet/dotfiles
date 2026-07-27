import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { StatePaths } from "./types.ts";

/** Returns manager-owned locations without creating them. */
export function resolveStatePaths(environment: NodeJS.ProcessEnv = process.env): StatePaths {
  const home = environment.HOME ?? homedir();
  const stateHome = environment.XDG_STATE_HOME ?? join(home, ".local", "state");
  // macOS normally lacks XDG_RUNTIME_DIR. A per-user directory under tmp is
  // still private once ensurePrivateDirectory applies mode 0700.
  const runtimeHome = environment.XDG_RUNTIME_DIR ?? join(tmpdir(), `pi-workspaces-${process.getuid?.() ?? "user"}`);
  const stateDirectory = join(stateHome, "pi-workspaces");
  return {
    stateDirectory,
    databasePath: join(stateDirectory, "state.db"),
    runtimeDirectory: join(runtimeHome, "runtime"),
  };
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { WorkspaceRegistry } from "../src/index.ts";

const execFileAsync = promisify(execFile);

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-concurrency-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

test("separate processes preserve concurrent updates to distinct sessions", async () => {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  registry.upsertRepository({ id: "repo", identity: "git:repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/repo", initializedAt: null, setupFailure: null });
  registry.close();

  const moduleUrl = pathToFileURL(join(process.cwd(), "src", "index.ts")).href;
  const worker = `import { WorkspaceRegistry } from ${JSON.stringify(moduleUrl)};
    const registry = WorkspaceRegistry.open({ paths: JSON.parse(process.env.PIW_PATHS) });
    const id = process.env.PIW_SESSION;
    registry.upsertSession({ id, rootId: 'root', sessionFile: '/sessions/' + id + '.jsonl', name: id, archived: false, unread: false, sortRank: 1 });
    registry.close();`;
  const environment = JSON.stringify(statePaths);
  await Promise.all(["one", "two"].map((id) => execFileAsync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", worker], {
    env: { ...process.env, PIW_PATHS: environment, PIW_SESSION: id },
  })));

  const reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.deepEqual(reopened.listSessions().map(({ id }) => id).sort(), ["one", "two"]);
  reopened.close();
});

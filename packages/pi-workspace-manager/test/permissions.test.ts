import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-permissions-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function mode(path: string): number {
  return lstatSync(path).mode & 0o777;
}

test("state database and runtime directory are private", () => {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  registry.close();
  assert.equal(mode(statePaths.stateDirectory), 0o700);
  assert.equal(mode(statePaths.runtimeDirectory), 0o700);
  assert.equal(mode(statePaths.databasePath), 0o600);
});

test("refuses a state directory accessible to another account", () => {
  const statePaths = paths();
  mkdirSync(statePaths.stateDirectory, { recursive: true, mode: 0o700 });
  chmodSync(statePaths.stateDirectory, 0o755);
  assert.throws(() => WorkspaceRegistry.open({ paths: statePaths }), /accessible to other accounts/);
});

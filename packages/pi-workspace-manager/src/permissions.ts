import { chmodSync, lstatSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const PRIVATE_MASK = 0o077;

export function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOwnedRegularPath(path, "directory");
  chmodSync(path, 0o700);
}

export function ensurePrivateFile(path: string): void {
  ensurePrivateDirectory(dirname(path));
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Refusing insecure state file: ${path}`);
  }
  assertOwnedRegularPath(path, "file");
  chmodSync(path, 0o600);
}

export function assertPrivateDirectory(path: string): void {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Refusing insecure runtime directory: ${path}`);
  }
  assertOwnedRegularPath(path, "directory");
}

function assertOwnedRegularPath(path: string, kind: "directory" | "file"): void {
  const info = statSync(path);
  const uid = process.getuid?.();
  if (uid !== undefined && info.uid !== uid) {
    throw new Error(`Refusing ${kind} not owned by this account: ${path}`);
  }
  if ((info.mode & PRIVATE_MASK) !== 0) {
    throw new Error(`Refusing ${kind} accessible to other accounts: ${path}`);
  }
}

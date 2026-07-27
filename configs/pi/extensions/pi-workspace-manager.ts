import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Pi loads the link by its destination path, so resolve the link before finding
// the repository-local manager source.
const extensionDirectory = dirname(realpathSync(fileURLToPath(import.meta.url)));
const manager = await import(pathToFileURL(resolve(extensionDirectory, "../../../packages/pi-workspace-manager/src/extension.ts")).href);

export default manager.default;

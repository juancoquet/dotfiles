import { execFileSync } from "node:child_process";
import { environmentForRoot } from "./bootstrap.ts";

const WORKSPACE_OPTION = "@piw_workspace_id";
const ROOT_OPTION = "@piw_root";
const EDITOR_OPTION = "@piw_nvim";
const EDITOR_WORKSPACE_OPTION = "@piw_nvim_workspace_id";
const WIDTH_OPTION = "@piw_nvim_width";
const PARKING_SESSION = "piw-parking";

export interface TmuxPaneClient {
  run(args: readonly string[]): string;
  tryRun(args: readonly string[]): string | undefined;
}

export type NvimToggleResult = "revealed" | "collapsed" | "not-managed";

/** Moves one workspace-owned nvim pane between its workspace and a parking window. */
export class NvimPaneManager {
  readonly #tmux: TmuxPaneClient;
  readonly #environment: (root: string) => NodeJS.ProcessEnv;

  constructor(tmux: TmuxPaneClient = new LocalTmuxPaneClient(), environment = environmentForRoot) {
    this.#tmux = tmux;
    this.#environment = environment;
  }

  toggle(): NvimToggleResult {
    const window = this.#tmux.run(["display-message", "-p", "#{window_id}"]).trim();
    const workspaceId = this.#option("show-window-options", window, WORKSPACE_OPTION);
    const root = this.#option("show-window-options", window, ROOT_OPTION);
    if (!workspaceId || !root) return "not-managed";

    const editor = this.#editorPane(workspaceId, window);
    if (editor?.window === window) {
      this.#collapse(editor.pane, window, workspaceId);
      return "collapsed";
    }
    if (editor) {
      this.#reveal(editor.pane, window, workspaceId);
      return "revealed";
    }
    this.#launch(window, workspaceId, root);
    return "revealed";
  }

  #launch(window: string, workspaceId: string, root: string): void {
    const environment = this.#environment(root);
    const command = ["env", `PIW_WORKSPACE_ID=${workspaceId}`, ...Object.entries(environment)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => `${key}=${value}`), "nvim"];
    const pane = this.#tmux.run(["split-window", "-h", "-p", "50", "-d", "-P", "-F", "#{pane_id}", "-t", window, "-c", root, ...command]).trim();
    this.#markEditor(pane, workspaceId);
    this.#tmux.run(["select-pane", "-t", pane]);
  }

  #collapse(pane: string, window: string, workspaceId: string): void {
    const width = this.#tmux.run(["display-message", "-p", "-t", pane, "#{pane_width}"]).trim();
    this.#tmux.run(["set-window-option", "-t", window, WIDTH_OPTION, width]);
    this.#ensureParkingSession();
    this.#tmux.run(["break-pane", "-d", "-s", pane, "-t", `${PARKING_SESSION}:parking`]);
  }

  #ensureParkingSession(): void {
    if (this.#tmux.tryRun(["has-session", "-t", PARKING_SESSION]) !== undefined) return;
    this.#tmux.run(["new-session", "-d", "-s", PARKING_SESSION, "-n", "parking"]);
  }

  #reveal(pane: string, window: string, workspaceId: string): void {
    const target = this.#workspacePane(window, workspaceId);
    if (!target) throw new Error(`Managed workspace ${workspaceId} has no Pi pane`);
    this.#tmux.run(["join-pane", "-h", "-d", "-s", pane, "-t", target]);
    const width = this.#option("show-window-options", window, WIDTH_OPTION);
    if (width) this.#tmux.run(["resize-pane", "-t", pane, "-x", width]);
    this.#tmux.run(["select-pane", "-t", pane]);
  }

  #markEditor(pane: string, workspaceId: string): void {
    this.#tmux.run(["set-option", "-p", "-t", pane, EDITOR_OPTION, "1"]);
    this.#tmux.run(["set-option", "-p", "-t", pane, EDITOR_WORKSPACE_OPTION, workspaceId]);
  }

  #editorPane(workspaceId: string, window: string): { pane: string; window: string } | undefined {
    const panes = this.#tmux.run(["list-panes", "-a", "-F", "#{pane_id}\t#{window_id}\t#{@piw_nvim}\t#{@piw_nvim_workspace_id}"]);
    for (const line of panes.trim().split("\n")) {
      const [pane, paneWindow, editor, owner] = line.split("\t");
      if (pane && paneWindow && editor === "1" && owner === workspaceId) return { pane, window: paneWindow };
    }
    return undefined;
  }

  #workspacePane(window: string, workspaceId: string): string | undefined {
    const panes = this.#tmux.run(["list-panes", "-t", window, "-F", "#{pane_id}\t#{@piw_nvim_workspace_id}"]);
    return panes.trim().split("\n")
      .map((line) => line.split("\t"))
      .find(([pane, editorOwner]) => pane && editorOwner !== workspaceId)?.[0];
  }

  #option(command: "show-window-options", target: string, option: string): string | undefined {
    const value = this.#tmux.tryRun([command, "-v", "-t", target, option])?.trim();
    return value || undefined;
  }
}

class LocalTmuxPaneClient implements TmuxPaneClient {
  run(args: readonly string[]): string {
    return execFileSync("tmux", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }

  tryRun(args: readonly string[]): string | undefined {
    try { return this.run(args); } catch { return undefined; }
  }
}

if (import.meta.main) new NvimPaneManager().toggle();

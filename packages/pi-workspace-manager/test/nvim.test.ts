import assert from "node:assert/strict";
import test from "node:test";
import { NvimPaneManager, type TmuxPaneClient } from "../src/index.ts";

class FakeTmux implements TmuxPaneClient {
  readonly calls: string[][] = [];
  readonly values = new Map<string, string>();

  run(args: readonly string[]): string {
    this.calls.push([...args]);
    return this.values.get(args.join("\0")) ?? "";
  }

  tryRun(args: readonly string[]): string | undefined {
    this.calls.push([...args]);
    return this.values.get(args.join("\0"));
  }

  set(args: string[], value: string): void { this.values.set(args.join("\0"), value); }
}

const WINDOW = "@1";
const WORKSPACE = "workspace-12345678";
const ROOT = "/repo/src";

function managedTmux(): FakeTmux {
  const tmux = new FakeTmux();
  tmux.set(["display-message", "-p", "#{window_id}"], `${WINDOW}\n`);
  tmux.set(["show-window-options", "-v", "-t", WINDOW, "@piw_workspace_id"], `${WORKSPACE}\n`);
  tmux.set(["show-window-options", "-v", "-t", WINDOW, "@piw_root"], `${ROOT}\n`);
  return tmux;
}

test("first reveal lazily starts nvim in the exact workspace root at half width", () => {
  const tmux = managedTmux();
  tmux.set(["list-panes", "-a", "-F", "#{pane_id}\t#{window_id}\t#{@piw_nvim}\t#{@piw_nvim_workspace_id}"], "%1\t@1\t\t\n");
  tmux.set(["split-window", "-h", "-p", "50", "-d", "-P", "-F", "#{pane_id}", "-t", WINDOW, "-c", ROOT, "env", `PIW_WORKSPACE_ID=${WORKSPACE}`, "PATH=/venv/bin", "VIRTUAL_ENV=/venv", "nvim"], "%2\n");

  const manager = new NvimPaneManager(tmux, () => ({ PATH: "/venv/bin", VIRTUAL_ENV: "/venv" }));
  assert.equal(manager.toggle(), "revealed");
  assert.ok(tmux.calls.some((args) => args.slice(0, 10).join(" ") === `split-window -h -p 50 -d -P -F #{pane_id} -t ${WINDOW}`));
  assert.ok(tmux.calls.some((args) => args.includes(`PIW_WORKSPACE_ID=${WORKSPACE}`)));
  assert.ok(tmux.calls.some((args) => args.join(" ") === `set-option -p -t %2 @piw_nvim 1`));
  assert.ok(tmux.calls.some((args) => args.join(" ") === `set-option -p -t %2 @piw_nvim_workspace_id ${WORKSPACE}`));
});

test("collapse parks the live editor and reveal rejoins it at its saved width", () => {
  const tmux = managedTmux();
  const allPanes = ["list-panes", "-a", "-F", "#{pane_id}\t#{window_id}\t#{@piw_nvim}\t#{@piw_nvim_workspace_id}"];
  tmux.set(allPanes, `%1\t${WINDOW}\t\t\n%2\t${WINDOW}\t1\t${WORKSPACE}\n`);
  tmux.set(["display-message", "-p", "-t", "%2", "#{pane_width}"], "73\n");
  const manager = new NvimPaneManager(tmux);
  assert.equal(manager.toggle(), "collapsed");
  assert.ok(tmux.calls.some((args) => args.join(" ") === "new-session -d -s piw-parking -n parking"));
  assert.ok(tmux.calls.some((args) => args.join(" ") === "break-pane -d -s %2 -t piw-parking:parking"));

  tmux.calls.length = 0;
  tmux.set(allPanes, `%1\t${WINDOW}\t\t\n%2\t@parking\t1\t${WORKSPACE}\n`);
  tmux.set(["list-panes", "-t", WINDOW, "-F", "#{pane_id}\t#{@piw_nvim_workspace_id}"], "%1\t\n");
  tmux.set(["show-window-options", "-v", "-t", WINDOW, "@piw_nvim_width"], "73\n");
  assert.equal(manager.toggle(), "revealed");
  assert.ok(tmux.calls.some((args) => args.join(" ") === "join-pane -h -d -s %2 -t %1"));
  assert.ok(tmux.calls.some((args) => args.join(" ") === "resize-pane -t %2 -x 73"));
});

test("does nothing outside a managed workspace", () => {
  const tmux = new FakeTmux();
  tmux.set(["display-message", "-p", "#{window_id}"], "@9\n");
  const manager = new NvimPaneManager(tmux);
  assert.equal(manager.toggle(), "not-managed");
  assert.equal(tmux.calls.some((args) => args[0] === "split-window"), false);
});

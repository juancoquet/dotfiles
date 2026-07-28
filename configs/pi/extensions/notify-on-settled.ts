import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const iconUrl = pathToFileURL(join(dirname(realpathSync(__filename)), "logo.png")).href;

const terminalApps = new Set([
  "alacritty",
  "ghostty",
  "iterm2",
  "kitty",
  "terminal",
  "warp",
  "wezterm",
]);

async function isTerminalFocused(): Promise<boolean> {
  const { stdout } = await execFileAsync("osascript", [
    "-e",
    'tell application "System Events" to get name of first application process whose frontmost is true',
  ]);
  return terminalApps.has(stdout.trim().toLowerCase());
}

type SessionEntry = {
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
};

function notificationBody(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getEntries() as unknown as SessionEntry[];
  const message = [...entries].reverse().find((entry) => entry.message?.role === "assistant")?.message;
  const text = message?.content
    ?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "Pi has finished.";
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_settled", async (_event, ctx) => {
    if (process.platform !== "darwin") return;

    try {
      if (await isTerminalFocused()) return;
      await execFileAsync("terminal-notifier", [
        "-message",
        notificationBody(ctx),
        "-title",
        "Pi",
        "-sound",
        "factorio-research-complete.aiff",
        "-appIcon",
        iconUrl,
        "-contentImage",
        iconUrl,
      ]);
    } catch {
      // Notifications are best-effort; never interrupt Pi when macOS rejects one.
    }
  });
}

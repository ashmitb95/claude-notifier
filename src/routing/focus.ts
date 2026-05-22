import * as fs from "fs";
import * as vscode from "vscode";
import { FOCUS_SIGNAL_FILE } from "../paths";
import { getOwnWorkspaceFolders, cwdMatchesFolder } from "./cwd";
import { log } from "../log";

export interface DoneContext {
  sessionId: string | null;
  pidChain: number[];
  cwd: string;
}

const lastDoneByCwd = new Map<string, DoneContext>();

export function rememberDone(ctx: DoneContext): void {
  if (!ctx.cwd) return;
  lastDoneByCwd.set(ctx.cwd, ctx);
}

export function getRememberedDone(cwd: string): DoneContext | null {
  return lastDoneByCwd.get(cwd) ?? null;
}

export function resetDoneMemory(): void {
  lastDoneByCwd.clear();
}

/**
 * Reveal the originating Claude session by matching the captured ancestor PIDs
 * against integrated terminals. Returns true when a terminal was revealed.
 *
 * Chat (webview) sessions intentionally have no reveal action here: the click
 * pipeline already brings the VS Code window forward, which shows the open chat.
 * The Anthropic `claude-vscode.editor.open` command was tried previously but it
 * opens a *new* tab whenever its in-memory session map misses, duplicating the
 * already-open chat instead of focusing it.
 */
export async function revealClaudeTab(ctx: DoneContext | null): Promise<boolean> {
  if (!ctx) return false;

  if (ctx.pidChain.length > 0) {
    for (const term of vscode.window.terminals) {
      const pid = await term.processId;
      if (pid && ctx.pidChain.includes(pid)) {
        term.show();
        return true;
      }
    }
  }

  return false;
}

let focusWatcher: fs.FSWatcher | null = null;

/**
 * Watch FOCUS_SIGNAL_FILE for terminal-notifier click signals. The file
 * content is the cwd of the firing session. Only the window whose workspace
 * contains that cwd acts.
 */
export function startFocusSignalWatcher(): vscode.Disposable {
  if (!fs.existsSync(FOCUS_SIGNAL_FILE)) {
    try {
      fs.writeFileSync(FOCUS_SIGNAL_FILE, "");
    } catch {}
  }
  try {
    focusWatcher = fs.watch(FOCUS_SIGNAL_FILE, (eventType) => {
      if (eventType === "change") {
        handleFocusSignal();
      }
    });
    log("focus-signal watcher started:", FOCUS_SIGNAL_FILE);
  } catch (err) {
    log("focus-signal watcher failed:", String(err));
  }
  return {
    dispose: () => {
      focusWatcher?.close();
      focusWatcher = null;
    },
  };
}

function handleFocusSignal(): void {
  let cwd = "";
  try {
    cwd = fs.readFileSync(FOCUS_SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }
  if (!cwd) return;

  const folders = getOwnWorkspaceFolders();
  if (folders.length > 0 && !folders.some((f) => cwdMatchesFolder(cwd, f))) {
    return;
  }

  void revealClaudeTab(getRememberedDone(cwd));
}

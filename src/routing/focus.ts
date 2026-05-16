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
 * Reveal the originating Claude session: match the captured ancestor PIDs
 * against integrated terminals first, then fall back to asking the Anthropic
 * Claude Code extension to open the editor panel for the session id.
 * Returns true when something was revealed.
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

  if (ctx.sessionId) {
    try {
      await vscode.commands.executeCommand("claude-vscode.editor.open", ctx.sessionId);
      return true;
    } catch {
      // Anthropic Claude Code extension not installed or command not registered.
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

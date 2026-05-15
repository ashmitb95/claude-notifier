import * as fs from "fs";
import * as vscode from "vscode";
import { SIGNAL_FILE } from "../paths";
import { LEVELS } from "./types";
import { parseSignal } from "./parser";
import { getOwnWorkspaceFolders, cwdMatchesFolder } from "../routing/cwd";
import { getEventLevel, getEventConfig } from "../settings/sync";
import { playLocalSound } from "../notifications/sound";
import { showLocalNotification } from "../notifications/local";
import { playRemoteSound } from "../notifications/remote";

let doneDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let watcher: fs.FSWatcher | null = null;

/**
 * Watch SIGNAL_FILE for changes and route to handleSignal(). Returns a
 * Disposable that closes the watcher.
 */
export function startSignalWatcher(): vscode.Disposable {
  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }
  watcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === "change") {
      handleSignal();
    }
  });
  return { dispose: () => { watcher?.close(); watcher = null; } };
}

function handleSignal(): void {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  const { reason, cwd } = parseSignal(content);

  // Each window only handles signals fired from inside its own workspace.
  // Signals without a cwd (older hook scripts) fall through to all windows
  // for backwards compatibility.
  if (cwd) {
    const folders = getOwnWorkspaceFolders();
    if (folders.length > 0 && !folders.some((f) => cwdMatchesFolder(cwd, f))) {
      return;
    }
  }

  if (reason === "done") {
    // Debounce "done" signals — Claude fires Stop hooks between subtasks.
    // Only notify after N ms of silence (no new signals).
    const debounceMs = vscode.workspace
      .getConfiguration("claudeNotifier")
      .get<number>("doneDebounceMs", 2000);
    if (doneDebounceTimer) clearTimeout(doneDebounceTimer);
    doneDebounceTimer = setTimeout(() => {
      doneDebounceTimer = null;
      showNotification("done");
    }, debounceMs);
  } else {
    // "question" and "input" signals are immediate — user action is needed.
    // Cancel any pending "done" notification (the stop after a question is expected).
    if (doneDebounceTimer) {
      clearTimeout(doneDebounceTimer);
      doneDebounceTimer = null;
    }
    if (reason === "input" || reason === "question") {
      showNotification(reason);
    }
  }
}

function showNotification(reason: string): void {
  // Architecture note: "question" and "input" local sounds are played by their
  // respective hook scripts (PreToolUse / PermissionRequest) — not the extension.
  // Only "done" local sounds are played here, because the extension debounces them.
  const isRemote = !!vscode.env.remoteName;

  if (reason === "input") {
    const level = getEventLevel("needsPermission");
    if (isRemote && (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND)) {
      playRemoteSound();
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage("Claude needs your permission.");
    }
  } else if (reason === "question") {
    const level = getEventLevel("asksQuestion");
    if (isRemote && (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND)) {
      playRemoteSound();
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage("Claude is asking you a question.");
    }
  } else if (reason === "done") {
    const level = getEventLevel("taskCompleted");
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) {
      if (isRemote) {
        playRemoteSound();
      } else {
        const cfg = getEventConfig("taskCompleted");
        playLocalSound(cfg.sound, "/System/Library/Sounds/Hero.aiff", "C:\\Windows\\Media\\tada.wav");
      }
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage("Claude has finished the task.");
      if (!isRemote) {
        showLocalNotification("Claude has finished the task.");
      }
    }
  }
}

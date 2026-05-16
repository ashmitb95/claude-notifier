import * as fs from "fs";
import * as vscode from "vscode";
import { SIGNAL_FILE } from "../paths";
import { LEVELS } from "./types";
import { parseSignal } from "./parser";
import * as stage from "./stage";
import { log } from "../log";
import { getOwnWorkspaceFolders, cwdMatchesFolder } from "../routing/cwd";
import { rememberDone, getRememberedDone, revealClaudeTab } from "../routing/focus";
import { getEventLevel, getEventConfig } from "../settings/sync";
import { playLocalSound } from "../notifications/sound";
import { showLocalNotification } from "../notifications/local";
import { playRemoteSound } from "../notifications/remote";

let watcher: fs.FSWatcher | null = null;
let deprecationLogged = false;

/**
 * Watch SIGNAL_FILE for changes and route to handleSignal(). Returns a
 * Disposable that closes the watcher and tears down per-session stage state.
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
  log("signal watcher started:", SIGNAL_FILE);
  return {
    dispose: () => {
      watcher?.close();
      watcher = null;
      stage.reset();
    },
  };
}

function handleSignal(): void {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }
  if (!content) return;

  const { reason, sessionId, cwd, pidChain } = parseSignal(content);
  log("signal:", reason, sessionId ?? "-", cwd || "(no cwd)");

  // UserPromptSubmit is coordination-only — advance the stage and exit.
  // No cwd routing for prompt; the prompt advance applies to every window
  // tracking this session (or the anonymous session).
  if (reason === "prompt") {
    stage.advance(sessionId);
    return;
  }

  // Each window only handles signals fired from inside its own workspace.
  // Signals without a cwd (older hook scripts, prompt hook) fall through.
  if (cwd) {
    const folders = getOwnWorkspaceFolders();
    if (folders.length > 0 && !folders.some((f) => cwdMatchesFolder(cwd, f))) {
      return;
    }
  }

  if (reason === "done" && cwd) {
    rememberDone({ sessionId, pidChain: pidChain ?? [], cwd });
  }

  if (reason === "done" || reason === "input" || reason === "question") {
    // Stage dedup: at most one notification per (session, reason) per stage.
    // Stage advances on UserPromptSubmit (prompt signal) or idle (30 min).
    if (!stage.shouldFire(sessionId, reason)) {
      return;
    }
    showNotification(reason, cwd);
  }

  // doneDebounceMs is deprecated — stage dedup replaces it. Log once so
  // anyone who set the value sees what's going on.
  warnDeprecatedSettingOnce();
}

function warnDeprecatedSettingOnce(): void {
  if (deprecationLogged) return;
  const raw = vscode.workspace.getConfiguration("claudeNotifier").inspect<number>("doneDebounceMs");
  const explicit =
    raw?.globalValue !== undefined ||
    raw?.workspaceValue !== undefined ||
    raw?.workspaceFolderValue !== undefined;
  if (explicit) {
    log(
      "[config] claudeNotifier.doneDebounceMs is deprecated and ignored; per-session stage dedup replaces it. Remove the setting to silence this notice."
    );
    deprecationLogged = true;
  }
}

function showNotification(reason: string, cwd: string): void {
  // Architecture note: "question" and "input" local sounds are played by their
  // respective hook scripts (PreToolUse / PermissionRequest) — not the extension.
  // Only "done" local sounds are played here, because the extension is the
  // only place that can debounce across multiple Stop signals from one task.
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
        playLocalSound(
          cfg.sound,
          "/System/Library/Sounds/Hero.aiff",
          "C:\\Windows\\Media\\tada.wav"
        );
      }
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window
        .showInformationMessage("Claude has finished the task.", "Reveal")
        .then((pick) => {
          if (pick === "Reveal") {
            void revealClaudeTab(getRememberedDone(cwd));
          }
        });
      if (!isRemote) {
        showLocalNotification("Claude has finished the task.", cwd);
      }
    }
  }
}

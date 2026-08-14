import * as fs from "fs";
import * as vscode from "vscode";
import { SIGNAL_FILE } from "../paths";
import { LEVELS } from "./types";
import { parseSignal } from "./parser";
import * as stage from "./stage";
import { log } from "../log";
import { getOwnWorkspaceFolders, cwdMatchesFolder, anotherWindowOwnsCwd } from "../routing/cwd";
import { rememberDone, getRememberedDone, revealClaudeTab } from "../routing/focus";
import {
  getEventLevel,
  getEventConfig,
  getSoundVolume,
  getMinTaskDurationThreshold,
  getRemoteAudio,
  getAutoMuteWhenFocused,
} from "../settings/sync";
import { playLocalSound } from "../notifications/sound";
import { showLocalNotification } from "../notifications/local";
import { playRemoteSound, pushRemoteAudio } from "../notifications/remote";
import { shouldSuppressForThreshold } from "./task-timer";
import { buildSessionLabel } from "./session-label";

let watcher: fs.FSWatcher | null = null;
let deprecationLogged = false;
let lastSignalSessionId: string | null = null;

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

  // Route by workspace. A window with folders open handles only signals fired
  // from inside its own workspace. A window with NO folder open (e.g. a loose
  // tab) acts as a fallback owner: it handles a cwd signal only when no other
  // live window already owns that cwd — so a stray tab never fires for another
  // window's project, but a Claude session running inside the folderless window
  // still notifies (and then the normal focus rules apply). Signals without a
  // cwd (older hook scripts, prompt hook) fall through.
  if (cwd) {
    const folders = getOwnWorkspaceFolders();
    if (folders.length > 0) {
      if (!folders.some((f) => cwdMatchesFolder(cwd, f))) return;
    } else if (anotherWindowOwnsCwd(cwd)) {
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
    lastSignalSessionId = sessionId;
    showNotification(reason, cwd);
  }

  if (reason === "subagent_done") {
    // No stage dedup — a single stage can include multiple Task subagents
    // and each finish is its own event. Level defaults to "off" so the
    // notification path stays silent unless the user opts in.
    lastSignalSessionId = sessionId;
    showNotification(reason, cwd);
  }

  // doneDebounceMs is deprecated — stage dedup replaces it. Log once so
  // anyone who set the value sees what's going on.
  warnDeprecatedSettingOnce();
}

// Test-only: directly drive the signal handler. Production calls it via fs.watch.
export function __handleSignalForTest(): void {
  handleSignal();
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
  // Auto-mute when focused: if the user is looking at this window, the extension
  // notification is redundant. Suppress the extension-played sound + all popups.
  // This is per-window-correct because dispatch only reaches here for signals in
  // this window's own workspace (see handleSignal's cwd filter), so a task in
  // a background window still notifies. Hook-played permission/question sounds are
  // out of scope — the hook process can't see window focus.
  if (getAutoMuteWhenFocused() && vscode.window.state.focused) return;

  // Name the session in every popup, so several concurrent sessions are
  // tellable apart. Resolved lazily (it reads the session transcript) so the
  // sound-only and "off" levels stay free, and memoised because a single
  // notification can build more than one message. An empty label means nothing
  // could be resolved, in which case each site keeps its original wording.
  let label: string | undefined;
  const message = (suffix: string, unlabelled: string): string => {
    if (label === undefined) {
      label = buildSessionLabel({ cwd, sessionId: lastSignalSessionId });
    }
    return label ? `${label} · ${suffix}` : unlabelled;
  };

  // Architecture note: "question" and "input" local sounds are played by their
  // respective hook scripts (PreToolUse / PermissionRequest) — not the extension.
  // Only "done" local sounds are played here, because the extension is the
  // only place that can debounce across multiple Stop signals from one task.
  const isRemote = !!vscode.env.remoteName;

  if (reason === "input") {
    const level = getEventLevel("needsPermission");
    const threshold = getMinTaskDurationThreshold();
    if (shouldSuppressForThreshold(lastSignalSessionId, threshold)) return;
    // In remote-audio mode the permission hook pushes this sound to the daemon;
    // the extension only falls back to the terminal bell when it's off.
    if (
      isRemote &&
      (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) &&
      !getRemoteAudio().enabled
    ) {
      playRemoteSound();
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage(
        message("needs permission", "Claude needs your permission.")
      );
    }
  } else if (reason === "question") {
    const level = getEventLevel("asksQuestion");
    const threshold = getMinTaskDurationThreshold();
    if (shouldSuppressForThreshold(lastSignalSessionId, threshold)) return;
    // In remote-audio mode the question hook pushes this sound to the daemon;
    // the extension only falls back to the terminal bell when it's off.
    if (
      isRemote &&
      (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) &&
      !getRemoteAudio().enabled
    ) {
      playRemoteSound();
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage(
        message("asked you a question", "Claude is asking you a question.")
      );
    }
  } else if (reason === "done") {
    const level = getEventLevel("taskCompleted");
    const threshold = getMinTaskDurationThreshold();
    if (shouldSuppressForThreshold(lastSignalSessionId, threshold)) return;
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) {
      const cfg = getEventConfig("taskCompleted");
      if (isRemote) {
        // Remote-audio mode: push to the daemon; otherwise terminal-bell fallback.
        if (!pushRemoteAudio("done", cfg.sound, getSoundVolume())) playRemoteSound();
      } else {
        playLocalSound(
          cfg.sound,
          "/System/Library/Sounds/Hero.aiff",
          "C:\\Windows\\Media\\tada.wav",
          getSoundVolume()
        );
      }
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window
        .showInformationMessage(message("finished", "Claude has finished the task."), "Reveal")
        .then((pick) => {
          if (pick === "Reveal") {
            void revealClaudeTab(getRememberedDone(cwd));
          }
        });
      if (!isRemote) {
        showLocalNotification(message("finished", "Claude has finished the task."), cwd);
      }
    }
  } else if (reason === "subagent_done") {
    const level = getEventLevel("subagentCompleted");
    const threshold = getMinTaskDurationThreshold();
    if (shouldSuppressForThreshold(lastSignalSessionId, threshold)) return;
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) {
      const cfg = getEventConfig("subagentCompleted");
      if (isRemote) {
        // Remote-audio mode: push to the daemon; otherwise terminal-bell fallback.
        if (!pushRemoteAudio("subagent_done", cfg.sound, getSoundVolume())) playRemoteSound();
      } else {
        playLocalSound(
          cfg.sound,
          "/System/Library/Sounds/Pop.aiff",
          "C:\\Windows\\Media\\notify.wav",
          getSoundVolume()
        );
      }
    }
    if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
      vscode.window.showInformationMessage(
        message("subagent finished", "Claude subagent finished.")
      );
    }
  }
}

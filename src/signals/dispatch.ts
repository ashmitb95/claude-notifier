import * as fs from "fs";
import * as vscode from "vscode";
import { SIGNAL_FILE, signalFileFor } from "../paths";
import { LEVELS } from "./types";
import { parseSignal } from "./parser";
import * as stage from "./stage";
import { log } from "../log";
import { getOwnWorkspaceFolders, cwdMatchesFolder } from "../routing/cwd";
import { rememberDone, getRememberedDone, revealClaudeTab } from "../routing/focus";
import {
  getEventLevel,
  getEventConfig,
  getSoundVolume,
  getMinTaskDurationThreshold,
  getRemoteAudio,
} from "../settings/sync";
import { playLocalSound } from "../notifications/sound";
import { showLocalNotification } from "../notifications/local";
import { playRemoteSound, pushRemoteAudio } from "../notifications/remote";
import { shouldSuppressForThreshold } from "./task-timer";

let watchers: fs.FSWatcher[] = [];
let deprecationLogged = false;
let lastSignalSessionId: string | null = null;

// Per-watcher debounce timers to coalesce Windows fs.watch double-fire
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 50;

/**
 * Watch SIGNAL_FILE and per-reason signal files for changes and route to
 * handleSignalFile(). Returns a Disposable that closes all watchers and
 * tears down per-session stage state.
 */
export function startSignalWatcher(): vscode.Disposable {
  // Ensure legacy signal file exists
  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }

  // Watch files: legacy + per-reason
  const filesToWatch = [
    SIGNAL_FILE,
    signalFileFor("done"),
    signalFileFor("prompt"),
    signalFileFor("input"),
    signalFileFor("question"),
    signalFileFor("subagent_done"),
  ];

  for (const file of filesToWatch) {
    // Ensure file exists before watching
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, "");
      } catch {}
    }

    const watcher = fs.watch(file, (eventType) => {
      if (eventType === "change") {
        // Debounce to coalesce Windows fs.watch double-fire
        const existing = debounceTimers.get(file);
        if (existing) clearTimeout(existing);
        debounceTimers.set(
          file,
          setTimeout(() => {
            debounceTimers.delete(file);
            handleSignalFile(file);
          }, DEBOUNCE_MS)
        );
      }
    });
    watchers.push(watcher);
  }

  log("signal watcher started:", SIGNAL_FILE, "+ per-reason files");
  return {
    dispose: () => {
      for (const w of watchers) w.close();
      watchers = [];
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
      stage.reset();
    },
  };
}

function handleSignalFile(filePath: string): void {
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return;
  }
  if (!content) return;

  const { reason, sessionId, cwd, pidChain } = parseSignal(content);
  log("signal:", reason, sessionId ?? "-", cwd || "(no cwd)", "from", filePath);

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

// Test-only: directly drive the signal handler for the legacy signal file.
export function __handleSignalForTest(): void {
  handleSignalFile(SIGNAL_FILE);
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
      vscode.window.showInformationMessage("Claude needs your permission.");
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
      vscode.window.showInformationMessage("Claude is asking you a question.");
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
      vscode.window.showInformationMessage("Claude subagent finished.");
    }
  }
}

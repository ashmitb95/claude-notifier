#!/usr/bin/env node
// Claude Notifier — Stop hook
// Writes a "done" signal for the VSCode extension to debounce. When no
// extension is active (terminal-only Claude session, or session outside any
// open workspace), plays sound/notification directly as a fallback.
const { isMuted, readConfig } = require("./_lib/config");
const { resolveSound, BUNDLED_FALLBACK } = require("./_lib/sounds");
const { playSound } = require("./_lib/play");
const { showNotification } = require("./_lib/notify");
const { extensionOwnsCwd } = require("./_lib/active");
const { writeSignal } = require("./_lib/signal");
const { getAncestorPids } = require("./_lib/pid");
const { buildClickAction, GENERIC_ACTIVATE } = require("./_lib/click");

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (input.stop_hook_active) process.exit(0);
  if (isMuted()) process.exit(0);

  const cwd = (input && input.cwd) || process.cwd() || "";
  const pidChain = getAncestorPids();

  writeSignal("done", input.session_id, cwd, pidChain);

  // If a VSCode window owns this cwd, the extension handles sound/notification
  // with debounce. Otherwise fall through to direct playback.
  if (extensionOwnsCwd(cwd)) process.exit(0);

  const config = readConfig();
  const cfg = config?.taskCompleted ?? {};
  const level = cfg.level ?? "sound+popup";
  const volume = config?.soundVolume ?? 1;

  if (level === "off") process.exit(0);

  if (level === "sound+popup" || level === "sound") {
    const sound = resolveSound(
      cfg.sound,
      "/System/Library/Sounds/Hero.aiff",
      "C:\\Windows\\Media\\tada.wav"
    );
    playSound(sound, BUNDLED_FALLBACK.taskCompleted, volume);
  }

  if (level === "sound+popup" || level === "popup") {
    // Stop notifications fire when the user is likely away — prefer
    // terminal-notifier so the click can focus VS Code.
    showNotification("Claude has finished the task.", {
      preferTerminalNotifier: true,
      executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
    });
  }

  process.exit(0);
});

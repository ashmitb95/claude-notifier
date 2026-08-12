#!/usr/bin/env node
// Claude Notifier — Stop hook
// Writes a "done" signal for the VSCode extension to debounce. When no
// extension is active (terminal-only Claude session, or session outside any
// open workspace), plays sound/notification directly as a fallback.
const { isMuted, isDisabled, readConfig } = require("./_lib/config");
const { BUNDLED_FALLBACK } = require("./_lib/sounds");
const { emitSound } = require("./_lib/emit");
const { showNotification } = require("./_lib/notify");
const { titleForCwd } = require("./_lib/title");
const { extensionOwnsCwd } = require("./_lib/active");
const { writeSignal } = require("./_lib/signal");
const { getAncestorPids } = require("./_lib/pid");
const { buildClickAction, GENERIC_ACTIVATE } = require("./_lib/click");
const { shouldSuppressForThreshold } = require("./_lib/task-timer");

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  if (isDisabled()) process.exit(0);

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

  const threshold = config?.minTaskDurationThreshold ?? 0;
  if (shouldSuppressForThreshold(input.session_id, threshold)) process.exit(0);

  if (level === "sound+popup" || level === "sound") {
    emitSound(
      "done",
      cfg.sound,
      {
        mac: "/System/Library/Sounds/Hero.aiff",
        win: "C:\\Windows\\Media\\tada.wav",
        fallback: BUNDLED_FALLBACK.taskCompleted,
      },
      volume,
      config
    );
  }

  if (level === "sound+popup" || level === "popup") {
    // Stop notifications fire when the user is likely away — prefer
    // terminal-notifier so the click can focus VS Code.
    showNotification("Claude has finished the task.", {
      title: titleForCwd(cwd),
      preferTerminalNotifier: true,
      executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
    });
  }

  process.exit(0);
});

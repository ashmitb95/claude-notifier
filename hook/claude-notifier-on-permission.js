#!/usr/bin/env node
// Claude Notifier — PermissionRequest hook
// Plays a sound + shows a notification when Claude needs permission to use a tool.
const { isMuted, readConfig } = require("./_lib/config");
const { resolveSound, BUNDLED_FALLBACK } = require("./_lib/sounds");
const { playSound } = require("./_lib/play");
const { showNotification } = require("./_lib/notify");
const { writeSignal } = require("./_lib/signal");
const { buildClickAction, GENERIC_ACTIVATE } = require("./_lib/click");
const { shouldSuppressForThreshold } = require("./_lib/task-timer");

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

  if (isMuted()) process.exit(0);

  // AskUserQuestion is handled by the separate PreToolUse question hook.
  if (input.tool_name === "AskUserQuestion") process.exit(0);

  const config = readConfig();

  // Subagent-originated permission requests: when enabled (default), exit
  // silently without sound/popup AND without writing the signal so the
  // extension's dispatch popup is also suppressed. agent_id is present only
  // when the hook fires inside a subagent call (per Claude Code docs).
  const suppressSubagent = config?.suppressSubagentInteractions !== false;
  if (suppressSubagent && input.agent_id) process.exit(0);

  const cfg = config?.needsPermission ?? {};
  const level = cfg.level ?? "sound+popup";
  const volume = config?.soundVolume ?? 1;

  if (level === "off") process.exit(0);

  const threshold = config?.minTaskDurationThreshold ?? 0;
  if (shouldSuppressForThreshold(input.session_id, threshold)) {
    // Suppress local sound + popup. Still write the signal so the extension
    // can react with its own (separately threshold-checked) handling.
    writeSignal("input", input.session_id);
    process.exit(0);
  }

  if (level === "sound+popup" || level === "sound") {
    const sound = resolveSound(
      cfg.sound,
      "/System/Library/Sounds/Glass.aiff",
      "C:\\Windows\\Media\\Windows Notify.wav"
    );
    playSound(sound, BUNDLED_FALLBACK.needsPermission, volume);
  }

  if (level === "sound+popup" || level === "popup") {
    const tool = input.tool_name || "a tool";
    const cwd = (input && input.cwd) || process.cwd() || "";
    showNotification(`Claude needs permission to use ${tool}.`, {
      preferTerminalNotifier: true,
      executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
    });
  }

  writeSignal("input", input.session_id);

  process.exit(0);
});

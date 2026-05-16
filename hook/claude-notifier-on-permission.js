#!/usr/bin/env node
// Claude Notifier — PermissionRequest hook
// Plays a sound + shows a notification when Claude needs permission to use a tool.
const { isMuted, readConfig } = require("./_lib/config");
const { resolveSound, BUNDLED_FALLBACK } = require("./_lib/sounds");
const { playSound } = require("./_lib/play");
const { showNotification } = require("./_lib/notify");
const { writeSignal } = require("./_lib/signal");

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

  const cfg = readConfig()?.needsPermission ?? {};
  const level = cfg.level ?? "sound+popup";

  if (level === "off") process.exit(0);

  if (level === "sound+popup" || level === "sound") {
    const sound = resolveSound(
      cfg.sound,
      "/System/Library/Sounds/Glass.aiff",
      "C:\\Windows\\Media\\Windows Notify.wav"
    );
    playSound(sound, BUNDLED_FALLBACK.needsPermission);
  }

  if (level === "sound+popup" || level === "popup") {
    const tool = input.tool_name || "a tool";
    showNotification(`Claude needs permission to use ${tool}.`);
  }

  writeSignal("input", input.session_id);

  process.exit(0);
});

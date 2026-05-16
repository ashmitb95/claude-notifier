#!/usr/bin/env node
// Claude Notifier — Notification hook
// Plays the "needs input" sound when Claude posts a permission_prompt
// notification. Uses fixed sound (not config-driven) — this hook fires
// before the PermissionRequest hook can react.
const { isMuted } = require("./_lib/config");
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

  if (input.notification_type !== "permission_prompt") process.exit(0);
  if (isMuted()) process.exit(0);

  // Fixed sound mapping (Glass on macOS, Notify on Windows, freedesktop bell
  // on Linux — resolveSound's table happens to map "Glass" to all three).
  const sound = resolveSound(
    "Glass",
    "/System/Library/Sounds/Glass.aiff",
    "C:\\Windows\\Media\\Windows Notify.wav"
  );
  playSound(sound, BUNDLED_FALLBACK.needsPermission);

  const message = input.message || "Claude needs your permission.";
  showNotification(message);

  writeSignal("input", input.session_id);

  process.exit(0);
});

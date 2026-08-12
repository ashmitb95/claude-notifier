#!/usr/bin/env node
// Claude Notifier — Notification hook
// Plays the "needs input" sound when Claude posts a permission_prompt
// notification. Uses fixed sound (not config-driven) — this hook fires
// before the PermissionRequest hook can react.
const { isMuted, isDisabled, readConfig } = require("./_lib/config");
const { BUNDLED_FALLBACK } = require("./_lib/sounds");
const { emitSound } = require("./_lib/emit");
const { showNotification } = require("./_lib/notify");
const { titleForCwd } = require("./_lib/title");
const { writeSignal } = require("./_lib/signal");

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

  if (input.notification_type !== "permission_prompt") process.exit(0);
  if (isMuted()) process.exit(0);

  // Fixed sound mapping (Glass on macOS, Notify on Windows, freedesktop bell
  // on Linux — resolveSound's table happens to map "Glass" to all three).
  const config = readConfig();
  const volume = config?.soundVolume ?? 1;
  emitSound(
    "input",
    "Glass",
    {
      mac: "/System/Library/Sounds/Glass.aiff",
      win: "C:\\Windows\\Media\\Windows Notify.wav",
      fallback: BUNDLED_FALLBACK.needsPermission,
    },
    volume,
    config
  );

  const message = input.message || "Claude needs your permission.";
  const cwd = (input && input.cwd) || process.cwd() || "";
  showNotification(message, { title: titleForCwd(cwd) });

  writeSignal("input", input.session_id);

  process.exit(0);
});

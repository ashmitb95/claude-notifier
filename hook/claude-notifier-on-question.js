#!/usr/bin/env node
// Claude Notifier — PreToolUse hook for AskUserQuestion
// Plays a sound + shows a notification when Claude asks the user a question.
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

  // Defense-in-depth: bail if a misconfigured matcher routes other tools here.
  if (input.tool_name !== "AskUserQuestion") process.exit(0);

  if (isMuted()) process.exit(0);

  const cfg = readConfig()?.asksQuestion ?? {};
  const level = cfg.level ?? "sound+popup";

  if (level === "off") process.exit(0);

  if (level === "sound+popup" || level === "sound") {
    const sound = resolveSound(
      cfg.sound,
      "/System/Library/Sounds/Funk.aiff",
      "C:\\Windows\\Media\\Windows Notify.wav"
    );
    playSound(sound, BUNDLED_FALLBACK.asksQuestion);
  }

  if (level === "sound+popup" || level === "popup") {
    showNotification("Claude is asking you a question.");
  }

  writeSignal("question", input.session_id);

  process.exit(0);
});

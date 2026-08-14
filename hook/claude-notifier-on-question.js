#!/usr/bin/env node
// Claude Notifier — PreToolUse hook for AskUserQuestion
// Plays a sound + shows a notification when Claude asks the user a question.
const { isMuted, isDisabled, readConfig } = require("./_lib/config");
const { BUNDLED_FALLBACK } = require("./_lib/sounds");
const { emitSound } = require("./_lib/emit");
const { showNotification } = require("./_lib/notify");
const { labelledMessage } = require("./_lib/session-label");
const { writeSignal } = require("./_lib/signal");
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

  // Defense-in-depth: bail if a misconfigured matcher routes other tools here.
  if (input.tool_name !== "AskUserQuestion") process.exit(0);

  if (isMuted()) process.exit(0);

  const config = readConfig();

  // Subagent-originated questions: exit silently when suppression is on so
  // neither the hook nor the extension popup fires. See on-permission.js.
  const suppressSubagent = config?.suppressSubagentInteractions !== false;
  if (suppressSubagent && input.agent_id) process.exit(0);

  const cfg = config?.asksQuestion ?? {};
  const level = cfg.level ?? "sound+popup";
  const volume = config?.soundVolume ?? 1;

  if (level === "off") process.exit(0);

  const threshold = config?.minTaskDurationThreshold ?? 0;
  if (shouldSuppressForThreshold(input.session_id, threshold)) {
    writeSignal("question", input.session_id);
    process.exit(0);
  }

  if (level === "sound+popup" || level === "sound") {
    emitSound(
      "question",
      cfg.sound,
      {
        mac: "/System/Library/Sounds/Funk.aiff",
        win: "C:\\Windows\\Media\\Windows Notify.wav",
        fallback: BUNDLED_FALLBACK.asksQuestion,
      },
      volume,
      config
    );
  }

  if (level === "sound+popup" || level === "popup") {
    const cwd = (input && input.cwd) || process.cwd() || "";
    showNotification(
      labelledMessage(input, "asked you a question", "Claude is asking you a question."),
      {
        preferTerminalNotifier: true,
        executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
      }
    );
  }

  writeSignal("question", input.session_id);

  process.exit(0);
});

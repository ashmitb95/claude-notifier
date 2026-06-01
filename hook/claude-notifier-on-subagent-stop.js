#!/usr/bin/env node
// Claude Notifier — SubagentStop hook
// Fires when a Task subagent finishes. Default level is "off" so this is
// silent until the user opts in via claudeNotifier.subagentCompleted.level.
// Mirrors the Stop hook's split: when a VS Code window owns the cwd, the
// extension handles the sound + popup; otherwise the hook plays directly.
const { isMuted, readConfig } = require("./_lib/config");
const { resolveSound, BUNDLED_FALLBACK } = require("./_lib/sounds");
const { playSound } = require("./_lib/play");
const { showNotification } = require("./_lib/notify");
const { extensionOwnsCwd } = require("./_lib/active");
const { writeSignal } = require("./_lib/signal");
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

  const cwd = (input && input.cwd) || process.cwd() || "";
  writeSignal("subagent_done", input.session_id, cwd);

  // Extension owns this cwd → it handles sound + popup via dispatch.
  if (extensionOwnsCwd(cwd)) process.exit(0);

  const config = readConfig();
  const cfg = config?.subagentCompleted ?? {};
  const level = cfg.level ?? "off";
  const volume = config?.soundVolume ?? 1;

  if (level === "off") process.exit(0);

  // Threshold check is consistent with the Stop hook — subagents in a quick
  // task that's still under the minTaskDurationThreshold shouldn't ping.
  const threshold = config?.minTaskDurationThreshold ?? 0;
  if (shouldSuppressForThreshold(input.session_id, threshold)) process.exit(0);

  if (level === "sound+popup" || level === "sound") {
    const sound = resolveSound(
      cfg.sound,
      "/System/Library/Sounds/Pop.aiff",
      "C:\\Windows\\Media\\notify.wav"
    );
    // No dedicated subagent fallback bundled; the taskCompleted fallback is
    // the closest semantic match.
    playSound(sound, BUNDLED_FALLBACK.taskCompleted, volume);
  }

  if (level === "sound+popup" || level === "popup") {
    showNotification("Claude subagent finished.");
  }

  process.exit(0);
});

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
const { agentLabel, agentId } = require("./_lib/agent");
const { sessionTitle } = require("./_lib/session-label");
const { doneDetail } = require("./_lib/detail");
const { activitySummary } = require("./_lib/activity");
const { safeCompose, eventLabel, wantsChatTitle, wantsDetail, EVENTS } = require("./_lib/compose");

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
    // Resolved lazily so an opt-out skips the transcript read entirely.
    const chatTitleFor = () =>
      wantsChatTitle(config)
        ? sessionTitle({
            transcriptPath: input.transcript_path,
            sessionId: input.session_id,
            cwd,
            agent: agentId(),
          })
        : "";
    const { title, body } = safeCompose(
      titleForCwd(cwd),
      eventLabel(cfg.label, EVENTS.DONE),
      `${agentLabel()} has finished the task.`,
      () => {
        if (!wantsDetail(config)) {
          return { chatTitle: chatTitleFor(), detail: [] };
        }
        const prose = doneDetail(input.last_assistant_message);
        return {
          chatTitle: chatTitleFor(),
          detail: prose ? [prose] : activitySummary(input.transcript_path),
        };
      }
    );
    showNotification(body, {
      title,
      preferTerminalNotifier: true,
      executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
    });
  }

  process.exit(0);
});

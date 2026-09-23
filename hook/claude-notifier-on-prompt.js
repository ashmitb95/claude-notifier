#!/usr/bin/env node
// Claude Notifier — UserPromptSubmit hook
// Signals the extension to advance the per-session stage when the user
// submits a new prompt, and records the prompt-submit timestamp into a
// per-session marker file so threshold-aware sound paths can suppress
// short-task notifications. No sound, no notification — coordination only.
const { isDisabled } = require("./_lib/config");
const { writeSignal } = require("./_lib/signal");
const { recordTaskStart, getPromptId } = require("./_lib/task-timer");

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
  // Claude Code re-enters this hook mid-turn when a Task subagent hands its
  // report back to the parent session — same session_id, no agent_id, and the
  // same prompt_id as the turn already in flight. A repeated prompt_id means
  // the user hasn't submitted anything new, so advancing the stage (which
  // resets the done-dedup) and restarting the threshold clock would both be
  // wrong. Hosts that send no prompt_id keep the unconditional behaviour.
  const promptId = typeof input.prompt_id === "string" ? input.prompt_id : "";
  if (promptId && getPromptId(input.session_id) === promptId) process.exit(0);

  writeSignal("prompt", input.session_id);
  recordTaskStart(input.session_id, promptId);
  process.exit(0);
});

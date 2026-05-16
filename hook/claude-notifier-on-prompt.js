#!/usr/bin/env node
// Claude Notifier — UserPromptSubmit hook
// Signals the extension to advance the per-session stage when the user
// submits a new prompt. No sound, no notification — coordination only.
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
  writeSignal("prompt", input.session_id);
  process.exit(0);
});

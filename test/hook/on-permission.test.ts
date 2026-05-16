import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-permission");

// PATH is stripped in runHook so afplay/notify-send/osascript can't be
// found — the hook's try/catch swallows the spawn failure and the signal
// write path still runs. This lets us verify the full flow without
// actually playing sounds during tests.

describe("hook: claude-notifier-on-permission", () => {
  let home: ReturnType<typeof tmpHome>;
  beforeEach(() => (home = tmpHome()));
  afterEach(() => home.dispose());

  it("writes an 'input' signal for a normal tool", () => {
    const res = runHook(SCRIPT, { tool_name: "Bash", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });

  it("AskUserQuestion is skipped (handled by the question hook)", () => {
    const res = runHook(SCRIPT, { tool_name: "AskUserQuestion", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("muted: exits before signal write", () => {
    fs.writeFileSync(home.muteFlag, "");
    const res = runHook(SCRIPT, { tool_name: "Bash", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
    expect(res.durationMs).toBeLessThan(500);
  });

  it("level=off: exits before signal write", () => {
    fs.writeFileSync(home.configFile, JSON.stringify({ needsPermission: { level: "off" } }));
    const res = runHook(SCRIPT, { tool_name: "Bash", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("renders missing session id as '-'", () => {
    const res = runHook(SCRIPT, { tool_name: "Bash" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ -$/);
  });

  it("malformed JSON input exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "{ broken", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("handles a tool name with shell metacharacters in the notification text without crashing", () => {
    // Regression for the audit-flagged escaping issue. Even though PATH is
    // stripped so the spawn doesn't run, the hook's string-build path
    // should not throw on weird input.
    const res = runHook(
      SCRIPT,
      { tool_name: 'Bash; rm -rf /; echo "x', session_id: "s-1" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });
});

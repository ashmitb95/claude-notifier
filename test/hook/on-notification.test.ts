import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-notification");

describe("hook: claude-notifier-on-notification", () => {
  let home: ReturnType<typeof tmpHome>;
  beforeEach(() => (home = tmpHome()));
  afterEach(() => home.dispose());

  it("writes an 'input' signal for permission_prompt", () => {
    const res = runHook(
      SCRIPT,
      { notification_type: "permission_prompt", session_id: "s-1" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });

  it("non-permission_prompt notification_type is ignored", () => {
    const res = runHook(SCRIPT, { notification_type: "idle", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("missing notification_type exits cleanly", () => {
    const res = runHook(SCRIPT, { session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("muted: short-circuits before signal", () => {
    fs.writeFileSync(home.muteFlag, "");
    const res = runHook(
      SCRIPT,
      { notification_type: "permission_prompt", session_id: "s-1" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
    expect(res.durationMs).toBeLessThan(500);
  });

  it("uses input.message field if provided, otherwise default text", () => {
    // We can't directly observe the notification text from outside the
    // subprocess; just verify the hook accepts both shapes and writes
    // the signal correctly.
    const res = runHook(
      SCRIPT,
      {
        notification_type: "permission_prompt",
        session_id: "s-1",
        message: "Claude says: $(whoami)",
      },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });

  it("malformed JSON exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "x", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });
});

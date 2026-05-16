import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-prompt");

describe("hook: claude-notifier-on-prompt", () => {
  let home: ReturnType<typeof tmpHome>;
  beforeEach(() => (home = tmpHome()));
  afterEach(() => home.dispose());

  it("writes a 'prompt' signal with session id", () => {
    const res = runHook(SCRIPT, { session_id: "s-abc" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ s-abc$/);
  });

  it("missing session id renders as '-'", () => {
    const res = runHook(SCRIPT, {}, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ -$/);
  });

  it("never plays sound or shows notification (coordination only)", () => {
    const res = runHook(SCRIPT, { session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    // No mute flag set, no notification spawn — purely fast.
    expect(res.durationMs).toBeLessThan(500);
  });

  it("malformed JSON exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "[not json", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("ignores extra fields", () => {
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", prompt: "hello world", whatever: [1, 2] },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ s-1$/);
  });
});

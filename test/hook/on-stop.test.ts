import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript, simulateActiveExtension } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-stop");

describe("hook: claude-notifier-on-stop", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
    // Simulate an active extension owning the cwd by default, so the hook
    // writes its signal and exits cleanly before invoking sound playback.
    // Tests that explicitly want the terminal-fallback path can override.
    simulateActiveExtension(home.activeDir, ["/Users/foo/proj"]);
  });
  afterEach(() => home.dispose());

  // The pid_chain field is optional in the v2 signal: emitted on macOS/Linux
  // by the Stop hook, omitted on Windows. Regexes below tolerate both shapes.
  it("writes a v2 'done' signal with session id and cwd", () => {
    const res = runHook(SCRIPT, { session_id: "s-123", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done \d+ s-123( [0-9,]+)? \/Users\/foo\/proj$/);
  });

  it("renders missing session id as '-'", () => {
    const res = runHook(SCRIPT, { cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done \d+ -( [0-9,]+)? \/Users\/foo\/proj$/);
  });

  it("falls back to process.cwd() when input.cwd missing", () => {
    const res = runHook(SCRIPT, { session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done \d+ s-1( [0-9,]+)? \S+/);
  });

  it("stop_hook_active short-circuits before signal write", () => {
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", cwd: "/Users/foo/proj", stop_hook_active: true },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("muted: short-circuits before signal write (no sound, no signal)", () => {
    fs.writeFileSync(home.muteFlag, "");
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
    // Fast exit confirms the sound spawn was never attempted.
    expect(res.durationMs).toBeLessThan(500);
  });

  it("malformed JSON input exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "not valid json", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("ignores extra fields in the input JSON", () => {
    const res = runHook(
      SCRIPT,
      {
        session_id: "s-1",
        cwd: "/Users/foo/proj",
        extra: { nested: ["random"] },
        unknown_field: 42,
      },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done \d+ s-1( [0-9,]+)? \/Users\/foo\/proj$/);
  });

  it("cwd outside any active marker's folder falls through (signal still written)", () => {
    // The marker we placed in beforeEach claims /Users/foo/proj.
    // /tmp/different is not inside it, so extensionOwnsCwd returns false
    // and the hook proceeds to terminal-fallback. Signal still gets written.
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/tmp/different" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done \d+ s-1( [0-9,]+)? \/tmp\/different$/);
    // No timing assertion — terminal fallback may play sound here.
  });
});

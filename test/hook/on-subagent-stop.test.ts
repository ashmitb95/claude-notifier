import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript, simulateActiveExtension } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-subagent-stop");

describe("hook: claude-notifier-on-subagent-stop", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
    // Default: simulate an active extension owning the cwd so the hook
    // writes its signal and exits before the fallback sound path.
    simulateActiveExtension(home.activeDir, ["/Users/foo/proj"]);
  });
  afterEach(() => home.dispose());

  it("writes a 'subagent_done' signal with session id and cwd", () => {
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^subagent_done \d+ s-1 \/Users\/foo\/proj$/);
  });

  it("renders missing session id as '-'", () => {
    const res = runHook(SCRIPT, { cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^subagent_done \d+ - \/Users\/foo\/proj$/);
  });

  it("muted: short-circuits before signal write", () => {
    fs.writeFileSync(home.muteFlag, "");
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("level=off in config: signal still written, no sound spawn attempted", () => {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        subagentCompleted: { level: "off", sound: "Pop" },
        soundVolume: 1,
      })
    );
    // Remove the active-extension marker so the hook would otherwise take
    // the fallback (sound-playing) path.
    fs.rmSync(home.activeDir, { recursive: true, force: true });
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^subagent_done /);
    // Fast exit confirms no afplay/notify spawn.
    expect(res.durationMs).toBeLessThan(500);
  });

  it("default config (no level key) is treated as off", () => {
    // No config file at all → cfg.level defaults to "off" via ?? in the hook.
    fs.rmSync(home.activeDir, { recursive: true, force: true });
    const res = runHook(SCRIPT, { session_id: "s-1", cwd: "/Users/foo/proj" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^subagent_done /);
    expect(res.durationMs).toBeLessThan(500);
  });

  it("malformed JSON input exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "not valid json", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });
});

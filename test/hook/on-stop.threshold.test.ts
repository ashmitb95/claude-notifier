import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-stop");

describe("hook: on-stop — minTaskDurationThreshold", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
    // No active extension marker -> fallback sound path is reachable.
  });
  afterEach(() => home.dispose());

  function writeConfig(threshold: number) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        taskCompleted: { level: "sound+popup", sound: "Hero" },
        soundVolume: 1,
        minTaskDurationThreshold: threshold,
      })
    );
  }

  function writeMarker(sid: string, ageMs: number) {
    const dir = path.join(home.hooksDir, "claude-notifier-task-start");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sid}.json`),
      JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
    );
  }

  it("suppresses fallback sound when elapsed < threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 2_000); // 2s elapsed
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    // Signal is still written (extension's dispatch is the canonical decision
    // point); the hook only suppresses its own fallback sound + popup.
    expect(readSignal(home.signalFile)).toMatch(/^done /);
    // The hook should have short-circuited before the sound spawn → fast exit.
    expect(res.durationMs).toBeLessThan(500);
  });

  it("plays fallback sound when elapsed >= threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });

  it("plays fallback sound when threshold is 0", () => {
    writeConfig(0);
    writeMarker("sess-1", 2_000);
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });

  it("plays fallback sound when marker missing (fail open)", () => {
    writeConfig(10);
    // no marker written
    const res = runHook(SCRIPT, { session_id: "sess-missing", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });
});

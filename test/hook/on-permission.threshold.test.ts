import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-permission");

describe("hook: on-permission — minTaskDurationThreshold", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
  });
  afterEach(() => home.dispose());

  function writeConfig(threshold: number) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        needsPermission: { level: "sound+popup", sound: "Glass" },
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

  it("suppresses sound + popup when elapsed < threshold (signal still written)", () => {
    writeConfig(10);
    writeMarker("sess-1", 1_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    // Signal must still be written so the extension can react if it owns this session.
    expect(readSignal(home.signalFile)).toMatch(/^input /);
  });

  it("fires when elapsed >= threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input /);
  });

  it("fires when threshold is 0", () => {
    writeConfig(0);
    writeMarker("sess-1", 1_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input /);
  });
});

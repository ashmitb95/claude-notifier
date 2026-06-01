import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-permission");

describe("hook: on-permission — subagent suppression", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
  });
  afterEach(() => home.dispose());

  function writeConfig(suppress: boolean) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        needsPermission: { level: "sound+popup", sound: "Glass" },
        soundVolume: 1,
        minTaskDurationThreshold: 0,
        suppressSubagentInteractions: suppress,
      })
    );
  }

  it("subagent permission (agent_id present): silent exit, NO signal written", () => {
    writeConfig(true);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "Bash", agent_id: "agent-abc" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("main-agent permission (no agent_id): fires normally, signal written", () => {
    writeConfig(true);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });

  it("suppress=false: subagent permission fires normally", () => {
    writeConfig(false);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "Bash", agent_id: "agent-abc" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input \d+ s-1$/);
  });

  it("config missing suppressSubagentInteractions: defaults to true (suppress)", () => {
    // Default config without the key — hook should default to suppression.
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        needsPermission: { level: "sound+popup", sound: "Glass" },
        soundVolume: 1,
      })
    );
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "Bash", agent_id: "agent-abc" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });
});

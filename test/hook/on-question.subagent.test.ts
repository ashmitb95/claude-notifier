import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-question");

describe("hook: on-question — subagent suppression", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
  });
  afterEach(() => home.dispose());

  function writeConfig(suppress: boolean) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        asksQuestion: { level: "sound+popup", sound: "Funk" },
        soundVolume: 1,
        minTaskDurationThreshold: 0,
        suppressSubagentInteractions: suppress,
      })
    );
  }

  it("subagent question (agent_id present): silent exit, NO signal written", () => {
    writeConfig(true);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "AskUserQuestion", agent_id: "agent-abc" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("main-agent question (no agent_id): fires normally, signal written", () => {
    writeConfig(true);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "AskUserQuestion" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question \d+ s-1$/);
  });

  it("suppress=false: subagent question fires normally", () => {
    writeConfig(false);
    const res = runHook(
      SCRIPT,
      { session_id: "s-1", tool_name: "AskUserQuestion", agent_id: "agent-abc" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question \d+ s-1$/);
  });
});

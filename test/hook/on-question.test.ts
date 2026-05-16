import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-question");

describe("hook: claude-notifier-on-question", () => {
  let home: ReturnType<typeof tmpHome>;
  beforeEach(() => (home = tmpHome()));
  afterEach(() => home.dispose());

  it("writes a 'question' signal for AskUserQuestion", () => {
    const res = runHook(SCRIPT, { tool_name: "AskUserQuestion", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question \d+ s-1$/);
  });

  it("ignores non-AskUserQuestion tools (defense-in-depth against misconfigured matcher)", () => {
    for (const tool of ["Bash", "Read", "Edit", "Grep"]) {
      const res = runHook(SCRIPT, { tool_name: tool, session_id: "s-1" }, home.root);
      expect(res.status).toBe(0);
      expect(readSignal(home.signalFile)).toBe("");
    }
  });

  it("missing tool_name is treated as non-match", () => {
    const res = runHook(SCRIPT, { session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("muted: exits before signal write", () => {
    fs.writeFileSync(home.muteFlag, "");
    const res = runHook(SCRIPT, { tool_name: "AskUserQuestion", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
    expect(res.durationMs).toBeLessThan(500);
  });

  it("level=off: exits before signal write", () => {
    fs.writeFileSync(home.configFile, JSON.stringify({ asksQuestion: { level: "off" } }));
    const res = runHook(SCRIPT, { tool_name: "AskUserQuestion", session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("malformed JSON input exits 0 with no signal", () => {
    const res = runHook(SCRIPT, "garbage", home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("renders missing session id as '-'", () => {
    const res = runHook(SCRIPT, { tool_name: "AskUserQuestion" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question \d+ -$/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-prompt");

/**
 * When a Task subagent hands its report back, Claude Code re-enters
 * UserPromptSubmit on the parent session with the same prompt_id as the turn
 * already in flight. Treating that as a new prompt advances the dedup stage
 * and restarts the threshold clock mid-task.
 */
describe("hook: on-prompt — subagent hand-back is not a new turn", () => {
  let home: ReturnType<typeof tmpHome>;
  let taskDir: string;

  beforeEach(() => {
    home = tmpHome();
    taskDir = path.join(home.hooksDir, "claude-notifier-task-start");
  });
  afterEach(() => home.dispose());

  it("re-entry with the same prompt_id writes no signal", () => {
    runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    fs.writeFileSync(home.signalFile, "");

    const res = runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toBe("");
  });

  it("re-entry with the same prompt_id leaves the task-start marker alone", () => {
    runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    const marker = path.join(taskDir, "s-1.json");
    const before = fs.readFileSync(marker, "utf-8");

    const res = runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    expect(res.status).toBe(0);
    expect(fs.readFileSync(marker, "utf-8")).toBe(before);
  });

  it("a genuinely new prompt_id advances as usual", () => {
    runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    const res = runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-2" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ s-1$/);
    expect(JSON.parse(fs.readFileSync(path.join(taskDir, "s-1.json"), "utf-8")).promptId).toBe(
      "p-2"
    );
  });

  it("the same prompt_id in a different session still advances", () => {
    runHook(SCRIPT, { session_id: "s-1", prompt_id: "p-1" }, home.root);
    fs.writeFileSync(home.signalFile, "");

    const res = runHook(SCRIPT, { session_id: "s-2", prompt_id: "p-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ s-2$/);
  });

  it("payloads without prompt_id keep advancing every time (Codex, older hosts)", () => {
    runHook(SCRIPT, { session_id: "s-1" }, home.root);
    fs.writeFileSync(home.signalFile, "");

    const res = runHook(SCRIPT, { session_id: "s-1" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^prompt \d+ s-1$/);
  });
});

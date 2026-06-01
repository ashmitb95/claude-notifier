import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-prompt");

describe("hook: claude-notifier-on-prompt — task-start marker", () => {
  let home: ReturnType<typeof tmpHome>;
  let taskDir: string;

  beforeEach(() => {
    home = tmpHome();
    taskDir = path.join(home.hooksDir, "claude-notifier-task-start");
  });
  afterEach(() => home.dispose());

  it("writes per-session marker with startedAt", () => {
    const res = runHook(SCRIPT, { session_id: "sess-1" }, home.root);
    expect(res.status).toBe(0);
    const file = path.join(taskDir, "sess-1.json");
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(data.sessionId).toBe("sess-1");
    expect(typeof data.startedAt).toBe("number");
  });

  it("uses __anon__ when session_id missing", () => {
    const res = runHook(SCRIPT, {}, home.root);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(taskDir, "__anon__.json"))).toBe(true);
  });
});

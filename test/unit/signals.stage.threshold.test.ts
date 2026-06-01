import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const IDLE_MS = 30 * 60 * 1000;
let tmpRoot: string;
let tmpTaskDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stage-threshold-test-"));
  const tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("stage idle-reset deletes session marker", () => {
  it("deletes the session marker when idle timer fires", async () => {
    const stage = await import("../../src/signals/stage");
    const timer = await import("../../src/signals/task-timer");
    timer.recordTaskStart("sess-1");
    expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(true);

    // Touch the stage so the idle timer is armed.
    stage.shouldFire("sess-1", "done");

    // Advance past the 30-min idle window.
    vi.advanceTimersByTime(IDLE_MS + 1);

    expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(false);
  });
});

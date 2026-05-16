import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Set HOME before importing the lib (paths.js binds HOOKS_DIR at module
// load, so we must set process.env.HOME first and import once).
const HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-signal-"));
const HOOKS_DIR = path.join(HOME_DIR, ".claude", "hooks");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
fs.mkdirSync(HOOKS_DIR, { recursive: true });

const ORIG_HOME = process.env.HOME;
process.env.HOME = HOME_DIR;

const signal = await import("../../hook/_lib/signal");

beforeAll(() => {
  process.env.HOME = HOME_DIR;
});
beforeEach(() => {
  try {
    fs.unlinkSync(SIGNAL_FILE);
  } catch {}
});
afterAll(() => {
  process.env.HOME = ORIG_HOME;
  try {
    fs.rmSync(HOME_DIR, { recursive: true, force: true });
  } catch {}
});

describe("hook/_lib/signal — writeSignal", () => {
  it("v2 format with session id and cwd", () => {
    signal.writeSignal("done", "abc-123", "/Users/foo/proj");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ abc-123 \/Users\/foo\/proj$/);
  });

  it("v2 format without cwd", () => {
    signal.writeSignal("input", "abc-123");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^input \d+ abc-123$/);
  });

  it("missing session id renders as '-'", () => {
    signal.writeSignal("question");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^question \d+ -$/);
  });

  it("empty string session id renders as '-'", () => {
    signal.writeSignal("done", "", "/cwd");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ - \/cwd$/);
  });

  it("session id with whitespace is stripped", () => {
    signal.writeSignal("done", "abc\t 123\n", "/cwd");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ abc123 \/cwd$/);
  });

  it("does not throw with valid args", () => {
    expect(() => signal.writeSignal("done", "x", "/cwd")).not.toThrow();
  });

  it("includes pid_chain CSV before cwd when provided", () => {
    signal.writeSignal("done", "abc", "/Users/foo", [1001, 1002, 1003]);
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(
      /^done \d+ abc 1001,1002,1003 \/Users\/foo$/
    );
  });

  it("omits pid_chain when array is empty", () => {
    signal.writeSignal("done", "abc", "/Users/foo", []);
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ abc \/Users\/foo$/);
  });

  it("omits pid_chain when undefined", () => {
    signal.writeSignal("done", "abc", "/Users/foo");
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ abc \/Users\/foo$/);
  });

  it("filters non-positive and non-integer pids", () => {
    signal.writeSignal("done", "abc", "/Users/foo", [1001, 0, -5, 1.5, 2002]);
    expect(fs.readFileSync(SIGNAL_FILE, "utf-8")).toMatch(/^done \d+ abc 1001,2002 \/Users\/foo$/);
  });
});

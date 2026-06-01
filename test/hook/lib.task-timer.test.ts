import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HOOK_LIB_DIR = path.join(__dirname, "..", "..", "hook", "_lib");

let tmpRoot: string;
let tmpHooksDir: string;
let tmpTaskDir: string;
let originalHome: string | undefined;
let originalProfile: string | undefined;

function loadHookLib() {
  vi.resetModules();
  // hook/_lib/task-timer.js is CommonJS; load through require with cache
  // busting so each test re-resolves TASK_START_DIR against the current HOME.
  /* eslint-disable @typescript-eslint/no-require-imports */
  delete require.cache[require.resolve(path.join(HOOK_LIB_DIR, "task-timer.js"))];
  delete require.cache[require.resolve(path.join(HOOK_LIB_DIR, "paths.js"))];
  return require(path.join(HOOK_LIB_DIR, "task-timer.js"));
  /* eslint-enable @typescript-eslint/no-require-imports */
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hook-task-timer-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  originalHome = process.env.HOME;
  originalProfile = process.env.USERPROFILE;
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalProfile;
});

describe("hook _lib/task-timer.js", () => {
  it("recordTaskStart writes per-session marker", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    const file = path.join(tmpTaskDir, "sess-1.json");
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(data.sessionId).toBe("sess-1");
    expect(typeof data.startedAt).toBe("number");
  });

  it("recordTaskStart uses __anon__ for missing session", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart(undefined);
    expect(fs.existsSync(path.join(tmpTaskDir, "__anon__.json"))).toBe(true);
  });

  it("shouldSuppressForThreshold returns false when marker missing", async () => {
    const lib = await loadHookLib();
    expect(lib.shouldSuppressForThreshold("nope", 10)).toBe(false);
  });

  it("shouldSuppressForThreshold returns false when threshold is 0", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    expect(lib.shouldSuppressForThreshold("sess-1", 0)).toBe(false);
  });

  it("shouldSuppressForThreshold suppresses for fresh marker", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    expect(lib.shouldSuppressForThreshold("sess-1", 10)).toBe(true);
  });

  it("shouldSuppressForThreshold plays through when elapsed exceeds threshold", async () => {
    const lib = await loadHookLib();
    fs.mkdirSync(tmpTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpTaskDir, "sess-1.json"),
      JSON.stringify({ startedAt: Date.now() - 20_000, sessionId: "sess-1" })
    );
    expect(lib.shouldSuppressForThreshold("sess-1", 10)).toBe(false);
  });

  it("shouldSuppressForThreshold falls open on corrupt marker", async () => {
    const lib = await loadHookLib();
    fs.mkdirSync(tmpTaskDir, { recursive: true });
    fs.writeFileSync(path.join(tmpTaskDir, "sess-broken.json"), "not json");
    expect(lib.shouldSuppressForThreshold("sess-broken", 10)).toBe(false);
  });

  it("sanitizes session ids", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("../escape");
    const written = fs.readdirSync(tmpTaskDir);
    for (const f of written) {
      expect(f).not.toContain("..");
      expect(f).not.toContain("/");
      expect(f).not.toContain(path.sep);
    }
  });
});

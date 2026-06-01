import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let signalFile: string;
let configFile: string;
let playLocalCalls: number;
let popupCalls: number;

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/x" } }],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
  },
  window: {
    showInformationMessage: (..._args: unknown[]) => {
      popupCalls++;
      return Promise.resolve(undefined);
    },
  },
  env: { remoteName: undefined },
}));

vi.mock("../../src/notifications/sound", () => ({
  playLocalSound: () => {
    playLocalCalls++;
  },
}));

vi.mock("../../src/notifications/remote", () => ({
  playRemoteSound: () => {},
}));

vi.mock("../../src/notifications/local", () => ({
  showLocalNotification: () => {},
}));

vi.mock("../../src/routing/cwd", () => ({
  getOwnWorkspaceFolders: () => ["/x"],
  cwdMatchesFolder: (a: string, b: string) => a.startsWith(b),
}));

vi.mock("../../src/routing/focus", () => ({
  rememberDone: () => {},
  getRememberedDone: () => undefined,
  revealClaudeTab: () => Promise.resolve(),
  startFocusSignalWatcher: () => ({ dispose() {} }),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-subagent-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  signalFile = path.join(tmpHooksDir, "claude-signal");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  playLocalCalls = 0;
  popupCalls = 0;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

function writeConfig(level: string) {
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      subagentCompleted: { level, sound: "Pop" },
      soundVolume: 1,
      minTaskDurationThreshold: 0,
    })
  );
}

describe("dispatch — subagent_done branch", () => {
  it("fires sound + popup when level is sound+popup", async () => {
    writeConfig("sound+popup");
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("plays sound only when level is sound", async () => {
    writeConfig("sound");
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(0);
  });

  it("shows popup only when level is popup", async () => {
    writeConfig("popup");
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(1);
  });

  it("silent when level is off (default)", async () => {
    writeConfig("off");
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("no stage dedup — multiple subagent_done signals in same stage all fire", async () => {
    writeConfig("sound+popup");
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(2);
    expect(popupCalls).toBe(2);
  });

  it("suppresses sound+popup when elapsed < threshold", async () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        subagentCompleted: { level: "sound+popup", sound: "Pop" },
        soundVolume: 1,
        minTaskDurationThreshold: 10,
      })
    );
    const taskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "sess-1.json"),
      JSON.stringify({ startedAt: Date.now() - 1000, sessionId: "sess-1" })
    );
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `subagent_done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });
});

describe("dispatch — input/question branches threshold gating", () => {
  function writeInputConfig(threshold: number) {
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        needsPermission: { level: "sound+popup", sound: "Glass" },
        asksQuestion: { level: "sound+popup", sound: "Funk" },
        soundVolume: 1,
        minTaskDurationThreshold: threshold,
      })
    );
  }

  function writeMarker(sid: string, ageMs: number) {
    const taskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, `${sid}.json`),
      JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
    );
  }

  it("suppresses input popup when elapsed < threshold", async () => {
    writeInputConfig(10);
    writeMarker("sess-1", 1000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `input ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(popupCalls).toBe(0);
  });

  it("fires input popup when elapsed >= threshold", async () => {
    writeInputConfig(10);
    writeMarker("sess-1", 20_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `input ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(popupCalls).toBe(1);
  });

  it("suppresses question popup when elapsed < threshold", async () => {
    writeInputConfig(10);
    writeMarker("sess-2", 1000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `question ${Date.now()} sess-2 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(popupCalls).toBe(0);
  });

  it("fires question popup when elapsed >= threshold", async () => {
    writeInputConfig(10);
    writeMarker("sess-2", 20_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `question ${Date.now()} sess-2 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(popupCalls).toBe(1);
  });
});

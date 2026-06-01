import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let tmpTaskDir: string;
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-threshold-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
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

function writeConfig(threshold: number) {
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      taskCompleted: { level: "sound+popup", sound: "Hero" },
      soundVolume: 1,
      minTaskDurationThreshold: threshold,
    })
  );
}

function writeMarker(sid: string, ageMs: number) {
  fs.mkdirSync(tmpTaskDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpTaskDir, `${sid}.json`),
    JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
  );
}

describe("dispatch — done signal threshold gate", () => {
  it("suppresses local sound + popup when elapsed < threshold", async () => {
    writeConfig(10);
    writeMarker("sess-1", 1_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("fires local sound + popup when elapsed >= threshold", async () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("fires when threshold is 0", async () => {
    writeConfig(0);
    writeMarker("sess-1", 1_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
  });

  it("falls open when marker missing", async () => {
    writeConfig(10);
    // no marker
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-missing /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
  });
});

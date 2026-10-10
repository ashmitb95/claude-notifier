import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let signalFile: string;
let configFile: string;
let vscodeMessages: string[];
let systemMessages: string[];

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/x" } }],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
  },
  window: {
    showInformationMessage: (message: string) => {
      vscodeMessages.push(message);
      return Promise.resolve(undefined);
    },
  },
  env: { remoteName: undefined },
}));

vi.mock("../../src/notifications/sound", () => ({ playLocalSound: () => {} }));
vi.mock("../../src/notifications/remote", () => ({ playRemoteSound: () => {} }));
vi.mock("../../src/notifications/local", () => ({
  showLocalNotification: (_title: string, message: string) => systemMessages.push(message),
}));
vi.mock("../../src/routing/cwd", () => ({
  getOwnWorkspaceFolders: () => ["/x"],
  cwdMatchesFolder: (a: string, b: string) => a.startsWith(b),
  anotherWindowOwnsCwd: () => false,
}));
vi.mock("../../src/routing/focus", () => ({
  rememberDone: () => {},
  getRememberedDone: () => undefined,
  revealClaudeTab: () => Promise.resolve(),
  startFocusSignalWatcher: () => ({ dispose() {} }),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-agent-test-"));
  const hooksDir = path.join(tmpRoot, ".claude", "hooks");
  signalFile = path.join(hooksDir, "claude-signal");
  configFile = path.join(hooksDir, "claude-notifier-config.json");
  fs.mkdirSync(hooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  vscodeMessages = [];
  systemMessages = [];
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      taskCompleted: { level: "popup", label: "" },
      showChatTitle: false,
      showDetail: false,
      minTaskDurationThreshold: 0,
    })
  );
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

async function notify(signal: string): Promise<void> {
  vi.resetModules();
  const dispatch = await import("../../src/signals/dispatch");
  fs.writeFileSync(signalFile, signal);
  (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
}

describe("dispatch — task completion agent label", () => {
  it("identifies Codex in the VS Code toast and system notification", async () => {
    await notify(`done ${Date.now()} sess-1 agent=codex /x`);
    expect(vscodeMessages).toEqual(["Codex has finished the task."]);
    expect(systemMessages).toEqual(["Codex has finished the task."]);
  });

  it("keeps Claude wording when agent metadata is absent", async () => {
    await notify(`done ${Date.now()} sess-1 /x`);
    expect(vscodeMessages).toEqual(["Claude has finished the task."]);
    expect(systemMessages).toEqual(["Claude has finished the task."]);
  });

  it("keeps Claude wording for a legacy v1 signal", async () => {
    await notify(`done ${Date.now()} /x`);
    expect(vscodeMessages).toEqual(["Claude has finished the task."]);
    expect(systemMessages).toEqual(["Claude has finished the task."]);
  });
});

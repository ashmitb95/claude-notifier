import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as net from "net";

const terminalMock = vi.hoisted(() => ({
  createTerminal: vi.fn(),
  executeCommand: vi.fn(),
  terminal: {
    show: vi.fn(),
    dispose: vi.fn(),
    sendText: vi.fn(),
  },
}));

// remote.ts imports vscode for the terminal-bell path; stub the surface it uses.
vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners = new Set<(event: T) => void>();
    readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(event: T): void {
      for (const listener of this.listeners) listener(event);
    }
    dispose(): void {
      this.listeners.clear();
    }
  },
  workspace: {
    getConfiguration: () => ({
      get: <T>(_k: string, d?: T) => d,
      update: () => Promise.resolve(),
    }),
  },
  window: {
    createTerminal: terminalMock.createTerminal.mockImplementation(() => terminalMock.terminal),
  },
  commands: { executeCommand: terminalMock.executeCommand },
  ConfigurationTarget: { Global: 1 },
}));

let tmpRoot: string;
let configFile: string;

// Capture the first line pushed to a one-shot loopback server.
function listen(): Promise<{ port: number; received: Promise<string>; close: () => void }> {
  return new Promise((resolve) => {
    let resolveData!: (s: string) => void;
    const received = new Promise<string>((r) => (resolveData = r));
    const srv = net.createServer((sock) => {
      let buf = "";
      sock.on("data", (d) => (buf += d.toString()));
      sock.on("end", () => resolveData(buf.trim()));
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      resolve({ port: addr.port, received, close: () => srv.close() });
    });
  });
}

beforeEach(() => {
  terminalMock.createTerminal.mockClear();
  terminalMock.executeCommand.mockClear();
  terminalMock.terminal.show.mockClear();
  terminalMock.terminal.dispose.mockClear();
  terminalMock.terminal.sendText.mockClear();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote-audio-ext-"));
  const hooksDir = path.join(tmpRoot, ".claude", "hooks");
  configFile = path.join(hooksDir, "claude-notifier-config.json");
  fs.mkdirSync(hooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("extension pushRemoteAudio — src/notifications/remote.ts", () => {
  it("returns false (caller uses the bell fallback) when remote-audio is off", async () => {
    fs.writeFileSync(configFile, JSON.stringify({ remoteAudio: { enabled: false } }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 1)).toBe(false);
  });

  it("returns false when there is no remoteAudio config at all", async () => {
    fs.writeFileSync(configFile, JSON.stringify({ soundVolume: 1 }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 1)).toBe(false);
  });

  it("returns true and pushes the event when enabled (mirrors the hook path)", async () => {
    const { port, received, close } = await listen();
    fs.writeFileSync(configFile, JSON.stringify({ remoteAudio: { enabled: true, port } }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 0.5)).toBe(true);
    expect(JSON.parse(await received)).toEqual({ reason: "done", sound: "Hero", volume: 0.5 });
    close();
  });
});

interface BellPty {
  onDidWrite: (listener: (data: string) => void) => unknown;
  onDidClose: (listener: (code: void | number) => void) => unknown;
  open: (dimensions: undefined) => void;
  close: () => void;
}

describe("playRemoteSound fallback", () => {
  let playRemoteSound: () => void;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ playRemoteSound } = await import("../../src/notifications/remote"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function bellPty(call = 0): { pty: BellPty; writes: string[]; closes: (void | number)[] } {
    const options = terminalMock.createTerminal.mock.calls[call]?.[0] as { pty: BellPty };
    const writes: string[] = [];
    const closes: (void | number)[] = [];
    options.pty.onDidWrite((d) => writes.push(d));
    options.pty.onDidClose((c) => closes.push(c));
    return { pty: options.pty, writes, closes };
  }

  it("writes BEL to a pseudo-terminal output stream instead of terminal input", () => {
    playRemoteSound();

    expect(terminalMock.createTerminal).toHaveBeenCalledOnce();
    const { pty, writes, closes } = bellPty();
    pty.open(undefined);
    vi.runAllTimers();

    expect(writes).toEqual(["\u0007"]);
    expect(closes).toEqual([0]);
    expect(terminalMock.terminal.sendText).not.toHaveBeenCalled();
    expect(terminalMock.executeCommand).not.toHaveBeenCalledWith(
      "workbench.action.terminal.sendSequence",
      expect.anything()
    );
  });

  it("does not show the bell terminal, so the panel and active tab stay put", () => {
    playRemoteSound();
    bellPty().pty.open(undefined);
    vi.runAllTimers();

    expect(terminalMock.terminal.show).not.toHaveBeenCalled();
  });

  it("waits until VS Code listens for bells before writing BEL", () => {
    playRemoteSound();
    const { pty, writes, closes } = bellPty();
    pty.open(undefined);

    // VS Code attaches its onBell listener 1000 ms after creating the terminal.
    vi.advanceTimersByTime(1000);
    expect(writes).toEqual([]);

    vi.advanceTimersByTime(500);
    expect(writes).toEqual(["\u0007"]);
    expect(closes).toEqual([]);

    vi.advanceTimersByTime(1000);
    expect(closes).toEqual([0]);
  });

  it("rings once for events that arrive while a bell is pending", () => {
    playRemoteSound();
    playRemoteSound();
    expect(terminalMock.createTerminal).toHaveBeenCalledOnce();

    bellPty().pty.open(undefined);
    vi.runAllTimers();

    playRemoteSound();
    expect(terminalMock.createTerminal).toHaveBeenCalledTimes(2);
  });

  it("disposes a bell terminal that never opens and allows the next bell", () => {
    playRemoteSound();
    vi.advanceTimersByTime(10_000);

    expect(terminalMock.terminal.dispose).toHaveBeenCalledOnce();
    playRemoteSound();
    expect(terminalMock.createTerminal).toHaveBeenCalledTimes(2);
  });
});

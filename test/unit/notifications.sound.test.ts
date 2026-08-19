import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Captured spawns: { cmd } for exec, { file, args } for execFile.
let spawns: Array<{ cmd?: string; file?: string; args?: string[] }> = [];

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: (cmd: string) => {
      spawns.push({ cmd });
    },
    execFile: (file: string, args: string[]) => {
      spawns.push({ file, args });
    },
  };
});

const realPlatform = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

/** Load sound.ts fresh so src/paths re-reads process.platform. */
async function loadSound() {
  vi.resetModules();
  return await import("../../src/notifications/sound");
}

/** Recover the PowerShell script from a -EncodedCommand invocation. */
function decodePS(cmd: string): string {
  const b64 = cmd.split("-EncodedCommand ")[1];
  return Buffer.from(b64, "base64").toString("utf16le");
}

beforeEach(() => {
  spawns = [];
});

afterEach(() => {
  setPlatform(realPlatform);
});

// A bundled-fallback path under a home directory whose username has an
// apostrophe — the reachable case from #88.
const WIN_TRICKY = "C:\\Users\\O'Brien\\.claude\\hooks\\_lib\\sounds\\complete.wav";
const POSIX_TRICKY = '/home/o\'brien/sounds/$(id)`whoami`"x".oga';

describe("playLocalSound — Windows", () => {
  it("doubles apostrophes in the sound path so the PowerShell literal stays intact", async () => {
    setPlatform("win32");
    const { playLocalSound } = await loadSound();
    playLocalSound("no-such-sound", "/mac.aiff", WIN_TRICKY);

    expect(spawns).toHaveLength(1);
    const ps = decodePS(spawns[0].cmd!);
    expect(ps).toContain(`$s='C:\\Users\\O''Brien\\.claude\\hooks\\_lib\\sounds\\complete.wav'`);
    // The literal must close exactly once — a lone ' would terminate it early.
    expect(ps.split("'").length - 1).toBe(4);
  });
});

describe("playLocalSound — Linux", () => {
  it("shell-quotes the sound path in every chained player", async () => {
    setPlatform("linux");
    const { playLocalSound, LINUX_SOUNDS } = await loadSound();
    LINUX_SOUNDS.Tricky = POSIX_TRICKY;
    playLocalSound("Tricky", "/mac.aiff", "C:\\win.wav");

    expect(spawns).toHaveLength(1);
    const cmd = spawns[0].cmd!;
    const quoted = `'/home/o'\\''brien/sounds/$(id)\`whoami\`"x".oga'`;
    expect(cmd).toContain(`pw-play --volume=1 ${quoted} 2>/dev/null`);
    expect(cmd).toContain(`paplay --volume=65536 ${quoted} 2>/dev/null`);
    expect(cmd).toContain(`aplay ${quoted} 2>/dev/null`);
    // Nothing in the path may reach the shell unquoted.
    expect(cmd).not.toContain(`"${POSIX_TRICKY}"`);
  });
});

describe("playLocalSound — macOS", () => {
  it("spawns afplay without a shell, passing the path as an argument", async () => {
    setPlatform("darwin");
    const { playLocalSound } = await loadSound();
    playLocalSound("no-such-sound", POSIX_TRICKY, "C:\\win.wav", 0.5);

    expect(spawns).toHaveLength(1);
    expect(spawns[0].file).toBe("afplay");
    expect(spawns[0].args).toEqual(["-v", "0.5", POSIX_TRICKY]);
    expect(spawns[0].cmd).toBeUndefined();
  });
});

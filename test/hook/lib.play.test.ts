import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import * as path from "path";

// vi.mock() doesn't intercept CommonJS require(), and hook/_lib/play.js is CJS
// — so stub the real child_process exports it destructures at load time.
const nodeRequire = createRequire(__filename);
const cp = nodeRequire("child_process");
const realExecSync = cp.execSync;
const realExecFileSync = cp.execFileSync;

// Captured spawns: { cmd } for execSync, { file, args } for execFileSync.
let spawns: Array<{ cmd?: string; file?: string; args?: string[] }> = [];

const realPlatform = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

/** Load play.js fresh so hook/_lib/platform re-reads process.platform. */
async function loadPlaySound() {
  vi.resetModules();
  // play.js require()s its siblings through Node, whose cache vi.resetModules()
  // doesn't touch — platform.js would keep the flags from the previous test.
  const libDir = `${path.sep}hook${path.sep}_lib${path.sep}`;
  for (const key of Object.keys(nodeRequire.cache)) {
    if (key.includes(libDir)) delete nodeRequire.cache[key];
  }
  const mod = await import("../../hook/_lib/play");
  return mod.playSound as (p?: string, f?: string, v?: number) => void;
}

/** Recover the PowerShell script from a -EncodedCommand invocation. */
function decodePS(cmd: string): string {
  const b64 = cmd.split("-EncodedCommand ")[1];
  return Buffer.from(b64!, "base64").toString("utf16le");
}

beforeEach(() => {
  spawns = [];
  cp.execSync = (cmd: string) => {
    spawns.push({ cmd });
    return Buffer.from("");
  };
  cp.execFileSync = (file: string, args: string[]) => {
    spawns.push({ file, args });
    return Buffer.from("");
  };
});

afterEach(() => {
  cp.execSync = realExecSync;
  cp.execFileSync = realExecFileSync;
  setPlatform(realPlatform);
});

// A bundled-fallback path under a home directory whose username has an
// apostrophe — the reachable case from #88.
const WIN_TRICKY = "C:\\Users\\O'Brien\\.claude\\hooks\\_lib\\sounds\\complete.wav";
const POSIX_TRICKY = '/home/o\'brien/.claude/hooks/_lib/sounds/$(id)`whoami`"x".oga';

describe("hook/_lib/play — Windows", () => {
  it("doubles apostrophes in the sound path so the PowerShell literal stays intact", async () => {
    setPlatform("win32");
    const playSound = await loadPlaySound();
    playSound(undefined, WIN_TRICKY);

    expect(spawns).toHaveLength(1);
    const ps = decodePS(spawns[0]!.cmd!);
    expect(ps).toContain(`$s='C:\\Users\\O''Brien\\.claude\\hooks\\_lib\\sounds\\complete.wav'`);
    // The literal must close exactly once — a lone ' would terminate it early.
    expect(ps.split("'").length - 1).toBe(4);
  });
});

describe("hook/_lib/play — Linux", () => {
  it("shell-quotes the sound path in every chained player", async () => {
    setPlatform("linux");
    const playSound = await loadPlaySound();
    playSound(undefined, POSIX_TRICKY);

    expect(spawns).toHaveLength(1);
    const cmd = spawns[0]!.cmd!;
    const quoted = `'/home/o'\\''brien/.claude/hooks/_lib/sounds/$(id)\`whoami\`"x".oga'`;
    expect(cmd).toContain(`pw-play --volume=1 ${quoted} 2>/dev/null`);
    expect(cmd).toContain(`paplay --volume=65536 ${quoted} 2>/dev/null`);
    expect(cmd).toContain(`aplay ${quoted} 2>/dev/null`);
    // Nothing in the path may reach the shell unquoted.
    expect(cmd).not.toContain(`"${POSIX_TRICKY}"`);
  });
});

describe("hook/_lib/play — macOS", () => {
  it("spawns afplay without a shell, passing the path as an argument", async () => {
    setPlatform("darwin");
    const playSound = await loadPlaySound();
    playSound(undefined, POSIX_TRICKY, 0.5);

    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.file).toBe("afplay");
    expect(spawns[0]!.args).toEqual(["-v", "0.5", POSIX_TRICKY]);
    expect(spawns[0]!.cmd).toBeUndefined();
  });
});

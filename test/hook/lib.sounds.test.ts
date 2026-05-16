import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  resolveSound,
  MACOS_SOUNDS,
  WIN_SOUNDS,
  LINUX_SOUNDS,
  LINUX_SOUNDS_DIR,
  BUNDLED_SOUNDS_DIR,
  BUNDLED_FALLBACK,
} from "../../hook/_lib/sounds";

// resolveSound branches on process.platform (via the hook/_lib/platform
// module). The test suite runs on whichever host invoked it; we exercise
// the active-host branch here and validate the cross-platform tables by
// shape. End-to-end coverage on Win/Linux comes through CI (Phase 7).

describe("hook/_lib/sounds — resolveSound (active platform)", () => {
  it("returns a known preset's path or falls back to the platform default", () => {
    const r = resolveSound("Glass", "/mac-default", "C:\\win-default");
    // One of three valid outcomes depending on the host:
    expect([
      MACOS_SOUNDS.Glass,
      WIN_SOUNDS.Glass ?? "C:\\win-default",
      LINUX_SOUNDS.Glass,
    ]).toContain(r);
  });

  it("unknown preset falls back to the platform-appropriate default", () => {
    const r = resolveSound("Nonexistent_Preset", "/mac-default", "C:\\win-default");
    // macOS → defaultMac; Linux → complete.oga; Windows → defaultWin.
    expect(["/mac-default", "C:\\win-default", `${LINUX_SOUNDS_DIR}/complete.oga`]).toContain(r);
  });
});

describe("hook/_lib/sounds — cross-platform tables", () => {
  it("MACOS_SOUNDS covers the 14-preset enum", () => {
    expect(Object.keys(MACOS_SOUNDS).sort()).toEqual([
      "Basso",
      "Blow",
      "Bottle",
      "Frog",
      "Funk",
      "Glass",
      "Hero",
      "Morse",
      "Ping",
      "Pop",
      "Purr",
      "Sosumi",
      "Submarine",
      "Tink",
    ]);
    for (const v of Object.values(MACOS_SOUNDS)) {
      expect(v).toMatch(/^\/System\/Library\/Sounds\/.+\.aiff$/);
    }
  });

  it("WIN_SOUNDS covers the 8 Windows presets", () => {
    expect(Object.keys(WIN_SOUNDS).sort()).toEqual([
      "Windows Background",
      "Windows Notify",
      "chimes",
      "chord",
      "ding",
      "notify",
      "ringin",
      "tada",
    ]);
    for (const v of Object.values(WIN_SOUNDS)) {
      expect(v).toMatch(/^C:\\Windows\\Media\\.+\.wav$/);
    }
  });

  it("LINUX_SOUNDS mirrors the macOS preset names", () => {
    // Every macOS preset name has a Linux equivalent so users can pick the
    // same value cross-platform.
    for (const name of Object.keys(MACOS_SOUNDS)) {
      expect(LINUX_SOUNDS[name as keyof typeof LINUX_SOUNDS]).toBeDefined();
    }
    for (const v of Object.values(LINUX_SOUNDS)) {
      expect(v).toContain(LINUX_SOUNDS_DIR);
      expect(v).toMatch(/\.oga$/);
    }
  });
});

describe("hook/_lib/sounds — BUNDLED_FALLBACK", () => {
  // path.join uses the platform separator, so endsWith assertions adapt
  // automatically (forward slash on Unix, backslash on Windows).
  it("exposes a bundled fallback for each event kind", () => {
    expect(BUNDLED_FALLBACK.taskCompleted.endsWith(path.join("sounds", "task-complete.wav"))).toBe(
      true
    );
    expect(BUNDLED_FALLBACK.needsPermission.endsWith(path.join("sounds", "needs-input.wav"))).toBe(
      true
    );
    expect(BUNDLED_FALLBACK.asksQuestion.endsWith(path.join("sounds", "question.wav"))).toBe(true);
  });

  it("BUNDLED_SOUNDS_DIR resolves under hook/_lib/sounds/ (deploy target)", () => {
    expect(BUNDLED_SOUNDS_DIR.endsWith(path.join("hook", "_lib", "sounds"))).toBe(true);
  });
});

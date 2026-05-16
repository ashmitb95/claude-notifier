import { describe, it, expect } from "vitest";

const { buildClickAction, GENERIC_ACTIVATE } = await import("../../hook/_lib/click");

describe("hook/_lib/click — buildClickAction", () => {
  it("returns null for an empty cwd", () => {
    expect(buildClickAction("")).toBeNull();
    expect(buildClickAction(undefined)).toBeNull();
  });

  it("writes the cwd to the focus-signal file then brings VS Code forward", () => {
    const cmd = buildClickAction("/Users/foo/proj");
    expect(cmd).toContain("printf '%s' '/Users/foo/proj'");
    expect(cmd).toContain("claude-notifier-focus");
    expect(cmd).toContain("code '/Users/foo/proj'");
    expect(cmd).toContain("osascript -e 'tell application \"Visual Studio Code\" to activate'");
  });

  it("escapes single quotes in the cwd safely", () => {
    const cmd = buildClickAction("/Users/it's me/proj");
    expect(cmd).toContain("'/Users/it'\\''s me/proj'");
  });

  it("uses && / || sequencing so the fallback runs only when `code` is absent", () => {
    const cmd = buildClickAction("/x")!;
    expect(cmd).toMatch(/code\s+'\/x'\s+2>\/dev\/null\s+\|\|\s+osascript/);
  });
});

describe("hook/_lib/click — GENERIC_ACTIVATE", () => {
  it("exposes an osascript activate command for callers without a cwd", () => {
    expect(GENERIC_ACTIVATE).toContain("osascript");
    expect(GENERIC_ACTIVATE).toContain("Visual Studio Code");
    expect(GENERIC_ACTIVATE).toContain("activate");
  });
});

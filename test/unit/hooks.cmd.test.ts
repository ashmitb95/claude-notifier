import { describe, it, expect, vi } from "vitest";

describe("hookCmd", () => {
  it("on non-Windows emits a node command with quoted path", async () => {
    vi.resetModules();
    vi.doMock("../../src/paths", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/paths")>();
      return { ...actual, IS_WIN: false };
    });
    const { hookCmd } = await import("../../src/hooks/cmd");
    expect(hookCmd("/Users/foo/.claude/hooks/x.js")).toBe('node "/Users/foo/.claude/hooks/x.js"');
    vi.doUnmock("../../src/paths");
  });

  it("on Windows emits a powershell command with -NoProfile -NonInteractive -ExecutionPolicy Bypass -File", async () => {
    vi.resetModules();
    vi.doMock("../../src/paths", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/paths")>();
      return { ...actual, IS_WIN: true };
    });
    const { hookCmd } = await import("../../src/hooks/cmd");
    expect(hookCmd("C:\\Users\\foo\\.claude\\hooks\\x.ps1")).toBe(
      'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\\Users\\foo\\.claude\\hooks\\x.ps1"'
    );
    vi.doUnmock("../../src/paths");
  });

  it("preserves spaces in the path via double-quoting", async () => {
    vi.resetModules();
    vi.doMock("../../src/paths", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/paths")>();
      return { ...actual, IS_WIN: false };
    });
    const { hookCmd } = await import("../../src/hooks/cmd");
    expect(hookCmd("/Users/foo/My Folder/hook.js")).toBe('node "/Users/foo/My Folder/hook.js"');
    vi.doUnmock("../../src/paths");
  });
});

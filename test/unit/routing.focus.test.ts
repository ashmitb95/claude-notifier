import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import {
  rememberDone,
  getRememberedDone,
  resetDoneMemory,
  revealClaudeTab,
} from "../../src/routing/focus";

interface FakeTerminal {
  processId: Promise<number | undefined>;
  show: ReturnType<typeof vi.fn>;
}

function fakeTerminal(pid: number | undefined): FakeTerminal {
  return { processId: Promise.resolve(pid), show: vi.fn() };
}

describe("routing/focus — done memory", () => {
  beforeEach(() => resetDoneMemory());

  it("remembers and returns the last done context for a cwd", () => {
    rememberDone({ sessionId: "abc", pidChain: [1, 2], cwd: "/Users/foo" });
    expect(getRememberedDone("/Users/foo")).toEqual({
      sessionId: "abc",
      pidChain: [1, 2],
      cwd: "/Users/foo",
    });
  });

  it("overwrites prior context for the same cwd", () => {
    rememberDone({ sessionId: "a", pidChain: [1], cwd: "/x" });
    rememberDone({ sessionId: "b", pidChain: [2], cwd: "/x" });
    expect(getRememberedDone("/x")?.sessionId).toBe("b");
  });

  it("returns null for an unknown cwd", () => {
    expect(getRememberedDone("/never-set")).toBeNull();
  });

  it("ignores entries with an empty cwd", () => {
    rememberDone({ sessionId: "a", pidChain: [1], cwd: "" });
    expect(getRememberedDone("")).toBeNull();
  });

  it("resetDoneMemory clears all entries", () => {
    rememberDone({ sessionId: "a", pidChain: [1], cwd: "/x" });
    resetDoneMemory();
    expect(getRememberedDone("/x")).toBeNull();
  });
});

describe("routing/focus — revealClaudeTab", () => {
  beforeEach(() => {
    (vscode.window as { terminals: unknown[] }).terminals = [];
    vi.restoreAllMocks();
  });

  it("returns false for a null context", async () => {
    expect(await revealClaudeTab(null)).toBe(false);
  });

  it("matches a terminal whose processId is in the pid chain", async () => {
    const matchingTerm = fakeTerminal(1002);
    const otherTerm = fakeTerminal(9999);
    (vscode.window as { terminals: unknown[] }).terminals = [otherTerm, matchingTerm];

    const result = await revealClaudeTab({
      sessionId: null,
      pidChain: [1001, 1002, 1003],
      cwd: "/x",
    });

    expect(result).toBe(true);
    expect(matchingTerm.show).toHaveBeenCalledOnce();
    expect(otherTerm.show).not.toHaveBeenCalled();
  });

  it("never opens a new editor tab when no terminal matches (chat session)", async () => {
    (vscode.window as { terminals: unknown[] }).terminals = [fakeTerminal(9999)];
    const spy = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);

    const result = await revealClaudeTab({
      sessionId: "session-abc",
      pidChain: [1001, 1002],
      cwd: "/x",
    });

    expect(result).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("focuses the terminal without invoking any command", async () => {
    const matchingTerm = fakeTerminal(1001);
    (vscode.window as { terminals: unknown[] }).terminals = [matchingTerm];
    const spy = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);

    const result = await revealClaudeTab({
      sessionId: "session-abc",
      pidChain: [1001],
      cwd: "/x",
    });

    expect(result).toBe(true);
    expect(matchingTerm.show).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns false when pid chain is empty", async () => {
    const spy = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    expect(await revealClaudeTab({ sessionId: "abc", pidChain: [], cwd: "/x" })).toBe(false);
    expect(await revealClaudeTab({ sessionId: null, pidChain: [], cwd: "/x" })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { parseSignal } from "../../src/signals/parser";

describe("parseSignal", () => {
  describe("v2 format: <reason> <ts> <session_id|-> [<pid_chain>] [cwd]", () => {
    it("parses session_id and cwd", () => {
      expect(parseSignal("done 1234 abc-123 /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "/Users/foo/proj",
        pidChain: null,
      });
    });

    it("treats '-' session_id as null", () => {
      expect(parseSignal("done 1234 - /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "/Users/foo/proj",
        pidChain: null,
      });
    });

    it("handles cwd with spaces", () => {
      expect(parseSignal("done 1234 abc-123 /Users/foo/my project/code")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "/Users/foo/my project/code",
        pidChain: null,
      });
    });

    it("handles no cwd (permission/question/prompt)", () => {
      expect(parseSignal("input 1234 abc-123")).toEqual({
        reason: "input",
        sessionId: "abc-123",
        cwd: "",
        pidChain: null,
      });
    });

    it("handles a prompt signal", () => {
      expect(parseSignal("prompt 1234 abc-123")).toEqual({
        reason: "prompt",
        sessionId: "abc-123",
        cwd: "",
        pidChain: null,
      });
    });

    it("handles Windows-style cwd", () => {
      expect(parseSignal("done 1234 abc-123 C:\\Users\\foo\\proj")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "C:\\Users\\foo\\proj",
        pidChain: null,
      });
    });
  });

  describe("v2 with pid_chain", () => {
    it("parses a multi-pid chain before cwd", () => {
      expect(parseSignal("done 1234 abc-123 1001,1002,1003 /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "/Users/foo/proj",
        pidChain: [1001, 1002, 1003],
      });
    });

    it("parses a single-pid chain", () => {
      expect(parseSignal("done 1234 abc 4242 /Users/foo")).toEqual({
        reason: "done",
        sessionId: "abc",
        cwd: "/Users/foo",
        pidChain: [4242],
      });
    });

    it("parses a chain with '-' session_id", () => {
      expect(parseSignal("done 1234 - 100,200 /Users/foo")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "/Users/foo",
        pidChain: [100, 200],
      });
    });

    it("does not misdetect a cwd whose first segment looks numeric", () => {
      const r = parseSignal("done 1234 abc /Users/123/foo");
      expect(r.cwd).toBe("/Users/123/foo");
      expect(r.pidChain).toBeNull();
    });

    it("preserves cwd with spaces after pid_chain", () => {
      expect(parseSignal("done 1234 abc 100,200 /Users/foo/my project")).toEqual({
        reason: "done",
        sessionId: "abc",
        cwd: "/Users/foo/my project",
        pidChain: [100, 200],
      });
    });
  });

  describe("v1 format (legacy): <reason> <ts> [cwd]", () => {
    it("parses cwd as third token when no session_id present", () => {
      expect(parseSignal("done 1234 /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "/Users/foo/proj",
        pidChain: null,
      });
    });

    it("parses no-cwd v1 inputs", () => {
      expect(parseSignal("input 1234")).toEqual({
        reason: "input",
        sessionId: null,
        cwd: "",
        pidChain: null,
      });
    });

    it("disambiguates via path separator: forward slash → cwd", () => {
      // Third token contains '/' → must be a cwd, not a session id.
      const r = parseSignal("done 1234 /tmp");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("/tmp");
      expect(r.pidChain).toBeNull();
    });

    it("disambiguates via path separator: backslash → cwd", () => {
      const r = parseSignal("done 1234 C:\\tmp");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("C:\\tmp");
      expect(r.pidChain).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("empty input returns empty reason", () => {
      expect(parseSignal("")).toEqual({
        reason: "",
        sessionId: null,
        cwd: "",
        pidChain: null,
      });
    });

    it("single-word legacy signal (no timestamp, no cwd)", () => {
      expect(parseSignal("done")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "",
        pidChain: null,
      });
    });

    it("reason only with trailing space", () => {
      const r = parseSignal("done ");
      expect(r.reason).toBe("done");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("");
      expect(r.pidChain).toBeNull();
    });
  });
});

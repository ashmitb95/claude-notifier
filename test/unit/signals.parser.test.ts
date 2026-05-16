import { describe, it, expect } from "vitest";
import { parseSignal } from "../../src/signals/parser";

describe("parseSignal", () => {
  describe("v2 format: <reason> <ts> <session_id|-> [cwd]", () => {
    it("parses session_id and cwd", () => {
      expect(parseSignal("done 1234 abc-123 /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "/Users/foo/proj",
      });
    });

    it("treats '-' session_id as null", () => {
      expect(parseSignal("done 1234 - /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "/Users/foo/proj",
      });
    });

    it("handles cwd with spaces", () => {
      expect(parseSignal("done 1234 abc-123 /Users/foo/my project/code")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "/Users/foo/my project/code",
      });
    });

    it("handles no cwd (permission/question/prompt)", () => {
      expect(parseSignal("input 1234 abc-123")).toEqual({
        reason: "input",
        sessionId: "abc-123",
        cwd: "",
      });
    });

    it("handles a prompt signal", () => {
      expect(parseSignal("prompt 1234 abc-123")).toEqual({
        reason: "prompt",
        sessionId: "abc-123",
        cwd: "",
      });
    });

    it("handles Windows-style cwd", () => {
      expect(parseSignal("done 1234 abc-123 C:\\Users\\foo\\proj")).toEqual({
        reason: "done",
        sessionId: "abc-123",
        cwd: "C:\\Users\\foo\\proj",
      });
    });
  });

  describe("v1 format (legacy): <reason> <ts> [cwd]", () => {
    it("parses cwd as third token when no session_id present", () => {
      expect(parseSignal("done 1234 /Users/foo/proj")).toEqual({
        reason: "done",
        sessionId: null,
        cwd: "/Users/foo/proj",
      });
    });

    it("parses no-cwd v1 inputs", () => {
      expect(parseSignal("input 1234")).toEqual({
        reason: "input",
        sessionId: null,
        cwd: "",
      });
    });

    it("disambiguates via path separator: forward slash → cwd", () => {
      // Third token contains '/' → must be a cwd, not a session id.
      const r = parseSignal("done 1234 /tmp");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("/tmp");
    });

    it("disambiguates via path separator: backslash → cwd", () => {
      const r = parseSignal("done 1234 C:\\tmp");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("C:\\tmp");
    });
  });

  describe("edge cases", () => {
    it("empty input returns empty reason", () => {
      expect(parseSignal("")).toEqual({ reason: "", sessionId: null, cwd: "" });
    });

    it("single-word legacy signal (no timestamp, no cwd)", () => {
      expect(parseSignal("done")).toEqual({ reason: "done", sessionId: null, cwd: "" });
    });

    it("reason only with trailing space", () => {
      // First space exists, second doesn't — degenerate but should not throw.
      const r = parseSignal("done ");
      expect(r.reason).toBe("done");
      expect(r.sessionId).toBeNull();
      expect(r.cwd).toBe("");
    });
  });
});

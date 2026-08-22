import { describe, it, expect } from "vitest";

const { doneDetail, permissionDetail, questionDetail } = await import("../../hook/_lib/detail");

describe("hook/_lib/detail", () => {
  it("takes the first sentence of a short assistant message", () => {
    expect(doneDetail("Shipped 3.7.1 and filed two issues. Then went home.")).toBe(
      "Shipped 3.7.1 and filed two issues."
    );
  });

  it("keeps issue references intact while stripping markdown", () => {
    expect(doneDetail("**#94** now covers both events.")).toBe("#94 now covers both events.");
  });

  it("returns empty when the first sentence is too long", () => {
    expect(doneDetail("x".repeat(90) + ".")).toBe("");
  });

  it("prefers ruleContent over the raw command", () => {
    const input = {
      tool_name: "Bash",
      tool_input: { command: "rm -f /tmp/a; echo hi; echo there" },
      permission_suggestions: [{ rules: [{ toolName: "Bash", ruleContent: "rm -f /tmp/a" }] }],
    };
    expect(permissionDetail(input)).toBe("Bash: rm -f /tmp/a");
  });

  it("flattens and truncates a long multi-line command", () => {
    const input = {
      tool_name: "Bash",
      tool_input: { command: "echo one\necho two " + "x".repeat(80) },
    };
    const out = permissionDetail(input);
    expect(out.startsWith("Bash: echo one echo two")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(6 + 60);
  });

  it("shows a single question verbatim", () => {
    const input = { tool_input: { questions: [{ question: "Which format?", header: "Format" }] } };
    expect(questionDetail(input)).toBe("Which format?");
  });

  it("numbers the headers when several questions are asked", () => {
    const input = {
      tool_input: {
        questions: [
          { question: "a?", header: "Banner format" },
          { question: "b?", header: "Question body" },
        ],
      },
    };
    expect(questionDetail(input)).toBe("1. Banner format\n2. Question body");
  });

  it("returns empty for a malformed payload", () => {
    expect(questionDetail({})).toBe("");
    expect(permissionDetail({})).toBe("");
    expect(doneDetail(undefined)).toBe("");
  });
});

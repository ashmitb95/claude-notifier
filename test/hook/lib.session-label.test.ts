import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { sessionTitle } = await import("../../hook/_lib/session-label");

function writeTranscript(lines: object[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-"));
  const file = path.join(dir, "s.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}

describe("hook/_lib/session-label — sessionTitle", () => {
  it("prefers custom-title over ai-title", () => {
    const f = writeTranscript([
      { type: "ai-title", aiTitle: "Auto generated name" },
      { type: "custom-title", customTitle: "My renamed chat" },
    ]);
    expect(sessionTitle({ transcriptPath: f })).toBe("My renamed chat");
  });

  it("falls back to ai-title when there is no rename", () => {
    const f = writeTranscript([{ type: "ai-title", aiTitle: "Auto generated name" }]);
    expect(sessionTitle({ transcriptPath: f })).toBe("Auto generated name");
  });

  it("falls back to the first non-injected user message", () => {
    const f = writeTranscript([
      { type: "user", message: { content: "<system-reminder>ignore me</system-reminder>" } },
      { type: "user", message: { content: "fix the flaky login test" } },
    ]);
    expect(sessionTitle({ transcriptPath: f })).toBe("fix the flaky login test");
  });

  it("returns empty for a Codex session", () => {
    expect(sessionTitle({ transcriptPath: "/nope", agent: "codex" })).toBe("");
  });

  it("returns empty when nothing resolves", () => {
    expect(sessionTitle({ transcriptPath: "/does/not/exist" })).toBe("");
  });
});

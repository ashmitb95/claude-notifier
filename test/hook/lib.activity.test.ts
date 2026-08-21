import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { activitySummary } = await import("../../hook/_lib/activity");

function tx(lines: object[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-act-"));
  const file = path.join(dir, "s.jsonl");
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}
const use = (name: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name }] },
});

describe("hook/_lib/activity — activitySummary", () => {
  it("counts only tool calls after the last real user turn", () => {
    const f = tx([
      use("Bash"),
      { type: "user", message: { content: "do the thing" } },
      use("Bash"),
      use("Edit"),
    ]);
    expect(activitySummary(f)).toEqual(["edited 1 file · ran 1 command"]);
  });

  it("ignores injected user records when finding the boundary", () => {
    const f = tx([
      { type: "user", message: { content: "do the thing" } },
      use("Bash"),
      { type: "user", message: { content: "<system-reminder>noise</system-reminder>" } },
      use("Bash"),
    ]);
    expect(activitySummary(f)).toEqual(["ran 2 commands"]);
  });

  it("orders by priority, not frequency", () => {
    const f = tx([
      { type: "user", message: { content: "go" } },
      ...Array.from({ length: 12 }, () => use("Read")),
      use("Edit"),
    ]);
    expect(activitySummary(f)[0].startsWith("edited 1 file")).toBe(true);
  });

  it("splits subagent work onto its own line", () => {
    const f = tx([
      { type: "user", message: { content: "go" } },
      use("Bash"),
      { ...use("Read"), isSidechain: true },
    ]);
    expect(activitySummary(f)).toEqual(["ran 1 command", "subagents: read 1 file"]);
  });

  it("returns nothing when there was no tool activity", () => {
    const f = tx([{ type: "user", message: { content: "hello" } }]);
    expect(activitySummary(f)).toEqual([]);
  });
});

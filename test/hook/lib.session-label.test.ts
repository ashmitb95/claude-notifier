import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Set HOME before importing the lib (paths.js binds PROJECTS_DIR at module
// load).
const HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-hooklabel-"));
const PROJECTS = path.join(HOME_DIR, ".claude", "projects");
const CWD = path.join(path.sep, "home", "dev", "my-repo");
const SLUG = CWD.split(path.sep).join("-");
fs.mkdirSync(path.join(PROJECTS, SLUG), { recursive: true });

const ORIG_HOME = process.env.HOME;
process.env.HOME = HOME_DIR;

const sessionLabel = await import("../../hook/_lib/session-label");

function writeTranscript(sessionId: string, lines: unknown[]): string {
  const file = path.join(PROJECTS, SLUG, `${sessionId}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  return file;
}

beforeAll(() => {
  process.env.HOME = HOME_DIR;
});
afterAll(() => {
  process.env.HOME = ORIG_HOME;
  try {
    fs.rmSync(HOME_DIR, { recursive: true, force: true });
  } catch {}
});

describe("hook/_lib/session-label — buildSessionLabel", () => {
  it("resolves project and title from the default projects dir", () => {
    writeTranscript("h-both", [{ type: "ai-title", aiTitle: "Fix the flaky login test" }]);
    expect(sessionLabel.buildSessionLabel({ cwd: CWD, sessionId: "h-both" })).toBe(
      "my-repo · Fix the flaky login test"
    );
  });

  it("degrades to the project name when the session is unknown", () => {
    expect(sessionLabel.buildSessionLabel({ cwd: CWD, sessionId: "h-missing" })).toBe("my-repo");
  });

  it("returns empty string with no cwd and no session", () => {
    expect(sessionLabel.buildSessionLabel({})).toBe("");
  });

  it("does not throw on a called-with-nothing invocation", () => {
    expect(() => sessionLabel.buildSessionLabel()).not.toThrow();
  });
});

describe("hook/_lib/session-label — labelledMessage", () => {
  it("prefixes the label onto the suffix", () => {
    writeTranscript("h-msg", [{ type: "ai-title", aiTitle: "Fix the flaky login test" }]);
    const msg = sessionLabel.labelledMessage(
      { cwd: CWD, session_id: "h-msg" },
      "finished",
      "Claude has finished the task."
    );
    expect(msg).toBe("my-repo · Fix the flaky login test · finished");
  });

  it("prefers transcript_path from stdin", () => {
    const file = writeTranscript("h-stdin", [{ type: "ai-title", aiTitle: "From stdin" }]);
    const msg = sessionLabel.labelledMessage(
      { cwd: CWD, session_id: "h-stdin", transcript_path: file },
      "finished",
      "Claude has finished the task."
    );
    expect(msg).toBe("my-repo · From stdin · finished");
  });

  it("still labels with the project name when the session id is a placeholder", () => {
    const msg = sessionLabel.labelledMessage(
      { cwd: CWD, session_id: "-" },
      "finished",
      "Claude has finished the task."
    );
    expect(msg).toBe("my-repo · finished");
  });

  it("uses the unlabelled wording when no label can be built at all", () => {
    // buildSessionLabel returns "" only when there is neither a project nor a
    // title, which is what the extension side sees for a cwd-less signal.
    expect(sessionLabel.buildSessionLabel({ cwd: "", sessionId: "-" })).toBe("");
  });
});

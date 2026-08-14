import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildSessionLabel,
  readSessionTitle,
  findTranscript,
} from "../../src/signals/session-label";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-label-"));
const PROJECTS = path.join(ROOT, "projects");
const CWD = path.join(path.sep, "home", "dev", "my-repo");
// Claude Code slugs a cwd by replacing "/" with "-".
const SLUG = CWD.split(path.sep).join("-");
const SESSION = "aaaabbbb-1111-2222-3333-444455556666";

function writeTranscript(dir: string, sessionId: string, lines: unknown[]): string {
  const target = path.join(PROJECTS, dir);
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(target, `${sessionId}.jsonl`);
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  return file;
}

beforeAll(() => {
  fs.mkdirSync(PROJECTS, { recursive: true });
});
afterAll(() => {
  try {
    fs.rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("readSessionTitle", () => {
  it("reads the ai-title record", () => {
    const file = writeTranscript(SLUG, "t-title", [
      { type: "user", message: { role: "user", content: "fix the login test" } },
      { type: "ai-title", aiTitle: "Fix the flaky login test", sessionId: "t-title" },
    ]);
    expect(readSessionTitle(file)).toBe("Fix the flaky login test");
  });

  it("prefers the LAST ai-title, since a session can be re-titled", () => {
    const file = writeTranscript(SLUG, "t-retitle", [
      { type: "ai-title", aiTitle: "First guess", sessionId: "t-retitle" },
      { type: "ai-title", aiTitle: "Better title", sessionId: "t-retitle" },
    ]);
    expect(readSessionTitle(file)).toBe("Better title");
  });

  it("falls back to the first user message before a title exists", () => {
    const file = writeTranscript(SLUG, "t-young", [
      { type: "user", message: { role: "user", content: "why is the build red" } },
    ]);
    expect(readSessionTitle(file)).toBe("why is the build red");
  });

  it("reads text out of a structured content array", () => {
    const file = writeTranscript(SLUG, "t-array", [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "hello there" }] } },
    ]);
    expect(readSessionTitle(file)).toBe("hello there");
  });

  it("skips injected <system-reminder> turns", () => {
    const file = writeTranscript(SLUG, "t-injected", [
      {
        type: "user",
        message: { role: "user", content: "<system-reminder>ignore me</system-reminder>" },
      },
      { type: "user", message: { role: "user", content: "the real question" } },
    ]);
    expect(readSessionTitle(file)).toBe("the real question");
  });

  it("ignores malformed lines", () => {
    const target = path.join(PROJECTS, SLUG);
    fs.mkdirSync(target, { recursive: true });
    const file = path.join(target, "t-malformed.jsonl");
    fs.writeFileSync(file, '{not json at all\n{"type":"ai-title","aiTitle":"Survived"}\n');
    expect(readSessionTitle(file)).toBe("Survived");
  });

  it("collapses whitespace and truncates a very long title", () => {
    const file = writeTranscript(SLUG, "t-long", [
      { type: "ai-title", aiTitle: `${"x".repeat(200)}\n  spread   out` },
    ]);
    const title = readSessionTitle(file)!;
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title.endsWith("…")).toBe(true);
  });

  it("returns null for a missing file", () => {
    expect(readSessionTitle(path.join(PROJECTS, "nope", "missing.jsonl"))).toBeNull();
  });

  it("returns null when nothing identifying is present", () => {
    const file = writeTranscript(SLUG, "t-empty", [{ type: "assistant", message: {} }]);
    expect(readSessionTitle(file)).toBeNull();
  });
});

describe("findTranscript", () => {
  it("finds it via the slugged cwd", () => {
    const file = writeTranscript(SLUG, SESSION, [{ type: "ai-title", aiTitle: "Found" }]);
    expect(findTranscript(SESSION, CWD, PROJECTS)).toBe(file);
  });

  it("falls back to scanning when the slug does not match", () => {
    const file = writeTranscript("-some-other-slug", "s-scan", [
      { type: "ai-title", aiTitle: "Found by scan" },
    ]);
    expect(findTranscript("s-scan", CWD, PROJECTS)).toBe(file);
  });

  it("returns null for an unknown session", () => {
    expect(findTranscript("does-not-exist", CWD, PROJECTS)).toBeNull();
  });

  it("returns null for the '-' placeholder session id", () => {
    expect(findTranscript("-", CWD, PROJECTS)).toBeNull();
  });
});

describe("buildSessionLabel", () => {
  it("combines project and title", () => {
    writeTranscript(SLUG, "b-both", [{ type: "ai-title", aiTitle: "Fix the flaky login test" }]);
    expect(buildSessionLabel({ cwd: CWD, sessionId: "b-both", projectsDir: PROJECTS })).toBe(
      "my-repo · Fix the flaky login test"
    );
  });

  it("uses an explicit transcriptPath when given", () => {
    const file = writeTranscript("-unrelated", "b-explicit", [
      { type: "ai-title", aiTitle: "From stdin path" },
    ]);
    expect(
      buildSessionLabel({
        cwd: CWD,
        sessionId: "b-explicit",
        transcriptPath: file,
        projectsDir: PROJECTS,
      })
    ).toBe("my-repo · From stdin path");
  });

  it("degrades to the project name when no transcript resolves", () => {
    expect(buildSessionLabel({ cwd: CWD, sessionId: "nothing-here", projectsDir: PROJECTS })).toBe(
      "my-repo"
    );
  });

  it("tolerates a trailing separator on cwd", () => {
    expect(buildSessionLabel({ cwd: CWD + path.sep, projectsDir: PROJECTS })).toBe("my-repo");
  });

  it("returns empty string with nothing to go on, so callers keep their own wording", () => {
    expect(buildSessionLabel({ projectsDir: PROJECTS })).toBe("");
  });

  it("does not throw when the projects directory is absent", () => {
    expect(
      buildSessionLabel({ cwd: CWD, sessionId: SESSION, projectsDir: path.join(ROOT, "absent") })
    ).toBe("my-repo");
  });
});

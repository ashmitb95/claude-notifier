# Notification Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every OS notification say which Claude session fired it and what that session actually did, instead of a fixed sentence.

**Architecture:** Three independent resolvers (workspace name, chat title, per-event detail) feed one composer that emits `{title, body}` for the OS banner. Each resolver fails soft to the layer below, so a broken assumption costs a line rather than the notification. Hook and extension sides are parallel implementations, mirroring the existing `src/routing/cwd.ts` ↔ `hook/_lib/active.js` split.

**Tech Stack:** TypeScript (extension, `src/`), CommonJS Node (hooks, `hook/_lib/`), PowerShell (Windows hooks), Vitest.

---

## Before you start

Read these measured facts. They were established empirically and the plan depends on them:

| Fact | Value |
|---|---|
| Banner line width | ~40 chars |
| Banner body budget | exactly 4 lines |
| Chat-title cap at 2 detail lines | 36 chars (0 collisions across 19 real titles) |
| `ai-title` position | line 9 in 13 of 17 real transcripts |
| Rename record | `custom-title` — **separate from `ai-title`, and wins** |
| Codex sessions | carry no title in any form |

**The `path.sep` trap:** `cwdMatchesFolder` uses `path.sep` at runtime. Test fixtures with hardcoded forward slashes pass on macOS and fail on Windows. This broke `main` in `acca8b5`. Build fixture paths with `path.join(path.sep, ...)` — see `440b7b8` and `ec78ccd`.

**Do not touch `src/signals/dispatch.ts`'s four `showInformationMessage` calls.** The in-editor toast is single-line and explicitly out of scope.

---

## File Structure

**Create:**
- `hook/_lib/session-label.js` — chat title from the transcript head
- `hook/_lib/detail.js` — pure per-event detail extractors
- `hook/_lib/activity.js` — activity summary from the transcript tail
- `hook/_lib/compose.js` — assembles `{title, body}` and allocates the line budget
- `src/signals/session-label.ts` — extension mirror of the chat-title resolver
- `src/notifications/compose.ts` — extension mirror of the composer

**Modify:**
- `hook/claude-notifier-on-{stop,permission,question,subagent-stop,notification}.js`
- `src/notifications/local.ts`
- `hook/_lib.ps1` and the five `.ps1` hooks

**Already exists, do not rebuild:** `src/notifications/title.ts` and `hook/_lib/title.js` (workspace name, shipped in #87), and the `opts.title` plumbing through `hook/_lib/notify.js`.

---

### Task 1: Chat-title resolver (hook side)

**Files:**
- Create: `hook/_lib/session-label.js`
- Test: `test/hook/lib.session-label.test.ts`

PR #89 (branch `pr89`, already fetched) has a working version. Port it, then make the two changes below. Its 512KB head-read is verified safe and should be kept.

- [ ] **Step 0: Add `PROJECTS_DIR` to the hook paths module**

`hook/_lib/paths.js` does not export it yet, and the resolver needs it. Add beside the existing constants (the file already requires `path`):

```js
const PROJECTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".claude",
  "projects"
);
```

and add `PROJECTS_DIR` to its `module.exports`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hook/lib.session-label.test.ts`
Expected: FAIL — `Cannot find module '../../hook/_lib/session-label'`

- [ ] **Step 3: Write the implementation**

```js
const fs = require("fs");
const path = require("path");
const { PROJECTS_DIR } = require("./paths");

const MAX_TITLE = 70;
// ai-title and custom-title are both written near the start of a transcript
// while transcripts reach tens of MB, so only the head is read.
const HEAD_BYTES = 512 * 1024;

function collapse(value) {
  const flat = String(value).replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

function readHead(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, HEAD_BYTES);
    const buf = Buffer.allocUnsafe(length);
    fs.readSync(fd, buf, 0, length, 0);
    return buf.toString("utf-8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

function scan(text) {
  const lines = text.split("\n");
  // A user rename writes custom-title; Claude Code's own hydration is
  // `if (customTitle) currentSessionTitle ??= customTitle`, so it wins.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i] || !lines[i].includes('"custom-title"')) continue;
    try {
      const rec = JSON.parse(lines[i]);
      if (rec && rec.type === "custom-title" && rec.customTitle) return collapse(rec.customTitle);
    } catch {}
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i] || !lines[i].includes('"ai-title"')) continue;
    try {
      const rec = JSON.parse(lines[i]);
      if (rec && rec.type === "ai-title" && rec.aiTitle) return collapse(rec.aiTitle);
    } catch {}
  }
  // A session too young to have been titled yet.
  for (const line of lines) {
    if (!line || !line.includes('"user"')) continue;
    try {
      const rec = JSON.parse(line);
      if (!rec || rec.type !== "user" || !rec.message) continue;
      const c = rec.message.content;
      const text2 =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? (c.find((b) => b && b.type === "text") || {}).text || ""
            : "";
      // Skip injected <system-reminder> / <ide_selection> turns.
      if (text2 && !text2.trimStart().startsWith("<")) return collapse(text2);
    } catch {}
  }
  return "";
}

/** Locate a transcript. The slug guess covers the normal case; the scan is the fallback. */
function findTranscript(sessionId, cwd, projectsDir = PROJECTS_DIR) {
  if (!sessionId || sessionId === "-") return "";
  const fileName = `${sessionId}.jsonl`;
  if (cwd) {
    // Split on BOTH separators — a bare /\//g misses Windows paths entirely
    // and forces a full directory scan on every notification.
    const slug = String(cwd).split(/[\\/]+/).filter(Boolean).join("-");
    const guess = path.join(projectsDir, `-${slug}`, fileName);
    try {
      if (fs.existsSync(guess)) return guess;
    } catch {}
  }
  try {
    for (const entry of fs.readdirSync(projectsDir)) {
      const candidate = path.join(projectsDir, entry, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}
  return "";
}

/**
 * The chat title for a session, or "" when none resolves.
 * Codex sessions carry no title in any form, so they short-circuit.
 */
function sessionTitle({ transcriptPath, sessionId, cwd, projectsDir, agent } = {}) {
  if (agent === "codex") return "";
  let file = transcriptPath;
  if (!file || !fs.existsSync(file)) file = findTranscript(sessionId, cwd, projectsDir);
  if (!file) return "";
  return scan(readHead(file));
}

module.exports = { sessionTitle, findTranscript };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hook/lib.session-label.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add hook/_lib/session-label.js test/hook/lib.session-label.test.ts
git commit -m "feat(hooks): resolve the chat title from the session transcript"
```

---

### Task 2: Detail extractors (pure)

**Files:**
- Create: `hook/_lib/detail.js`
- Test: `test/hook/lib.detail.test.ts`

All three read fields already present on hook stdin. No file I/O.

- [ ] **Step 1: Write the failing test**

```ts
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
    const input = { tool_name: "Bash", tool_input: { command: "echo one\necho two " + "x".repeat(80) } };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hook/lib.detail.test.ts`
Expected: FAIL — `Cannot find module '../../hook/_lib/detail'`

- [ ] **Step 3: Write the implementation**

```js
// Detail line(s) for the notification body, extracted from hook stdin.
// Everything here is pure — no file I/O. See _lib/activity.js for the one
// piece that does read the transcript.

const SENTENCE_MAX = 80;
const COMMAND_MAX = 60;

/** Strip markdown without mangling issue references like #94. */
function plain(text) {
  return String(text)
    .replace(/[*`]/g, "")
    .replace(/^#+\s/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first sentence of the assistant's closing message, when it fits.
 * Returns "" if it does not — callers fall back to the activity summary
 * rather than showing a sentence sheared mid-clause.
 */
function doneDetail(lastAssistantMessage) {
  if (!lastAssistantMessage) return "";
  const flat = plain(lastAssistantMessage);
  if (!flat) return "";
  const first = flat.split(/(?<=[.!?])\s/)[0];
  return first.length <= SENTENCE_MAX ? first : "";
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

/**
 * The command permission is being asked for. permission_suggestions carries
 * Claude Code's own normalised form, which is shorter and more readable than
 * the raw compound command, so prefer it.
 */
function permissionDetail(input) {
  const tool = (input && input.tool_name) || "";
  const suggested =
    input &&
    Array.isArray(input.permission_suggestions) &&
    input.permission_suggestions
      .flatMap((s) => (s && Array.isArray(s.rules) ? s.rules : []))
      .map((r) => r && r.ruleContent)
      .find(Boolean);
  const raw = suggested || (input && input.tool_input && input.tool_input.command) || "";
  if (!raw) return "";
  const flat = String(raw).replace(/\s+/g, " ").trim();
  return tool ? `${tool}: ${truncate(flat, COMMAND_MAX)}` : truncate(flat, COMMAND_MAX);
}

/**
 * One question verbatim; two to four as a numbered list of their headers,
 * which the tool schema caps at 12 chars so they stay inside the line budget.
 */
function questionDetail(input) {
  const qs = input && input.tool_input && input.tool_input.questions;
  if (!Array.isArray(qs) || qs.length === 0) return "";
  if (qs.length === 1) return plain((qs[0] && qs[0].question) || "");
  return qs
    .map((q, i) => `${i + 1}. ${plain((q && q.header) || "")}`)
    .filter((line) => !line.endsWith(". "))
    .join("\n");
}

module.exports = { doneDetail, permissionDetail, questionDetail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hook/lib.detail.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add hook/_lib/detail.js test/hook/lib.detail.test.ts
git commit -m "feat(hooks): extract per-event notification detail from hook payloads"
```

---

### Task 3: Activity summary (transcript tail)

**Files:**
- Create: `hook/_lib/activity.js`
- Test: `test/hook/lib.activity.test.ts`

The fallback when `doneDetail` returns "". This is the only piece needing a second read, and it reads the **tail** — the chat title is at the head, but the turn's tool calls are at the end.

⚠️ **`isSidechain` is unverified.** No local transcript has ever run a subagent, so the assumption that subagent tool calls land in the same file with `isSidechain: true` is untested. Implement it, but if the field never appears the sidechain line is simply never emitted — which is a safe failure.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hook/lib.activity.test.ts`
Expected: FAIL — `Cannot find module '../../hook/_lib/activity'`

- [ ] **Step 3: Write the implementation**

```js
const fs = require("fs");

// The turn's tool calls sit at the END of the transcript, so this reads the
// tail — unlike _lib/session-label.js, which reads the head for the title.
const TAIL_BYTES = 256 * 1024;

// Priority order, not frequency: "edited 3 files" is worth reporting over
// "read 12 files" even when reads dominate the count.
const VERBS = [
  ["Edit", "edited", "file"],
  ["Write", "wrote", "file"],
  ["Bash", "ran", "command"],
  ["Task", "ran", "subagent"],
  ["WebFetch", "fetched", "page"],
  ["Read", "read", "file"],
  ["Grep", "searched", "time"],
  ["Glob", "searched", "time"],
];

function readTail(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.allocUnsafe(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString("utf-8");
    // Drop the partial first line when the read started mid-file.
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

function userText(rec) {
  const c = rec && rec.message && rec.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (b && b.text) || "").join(" ");
  return "";
}

function phrase(counts) {
  const parts = [];
  for (const [name, verb, noun] of VERBS) {
    const n = counts[name];
    if (!n) continue;
    parts.push(`${verb} ${n} ${noun}${n > 1 ? "s" : ""}`);
  }
  const known = new Set(VERBS.map((v) => v[0]));
  const other = Object.entries(counts)
    .filter(([k]) => !known.has(k))
    .reduce((a, [, v]) => a + v, 0);
  if (other) parts.push(`used ${other} other tool${other > 1 ? "s" : ""}`);
  return parts.slice(0, 2).join(" · ");
}

/** Up to two lines: main-thread work, then subagent work. */
function activitySummary(transcriptPath) {
  if (!transcriptPath) return [];
  const recs = [];
  for (const line of readTail(transcriptPath).split("\n")) {
    if (!line) continue;
    try {
      recs.push(JSON.parse(line));
    } catch {}
  }

  // The boundary is the last REAL user turn. Injected <system-reminder> and
  // <ide_selection> blocks are also type "user" and would reset it constantly.
  let start = 0;
  recs.forEach((rec, i) => {
    if (rec && rec.type === "user") {
      const t = userText(rec).trim();
      if (t && !t.startsWith("<")) start = i;
    }
  });

  const main = {};
  const side = {};
  for (const rec of recs.slice(start)) {
    const c = rec && rec.message && rec.message.content;
    if (!Array.isArray(c)) continue;
    const bucket = rec.isSidechain ? side : main;
    for (const block of c) {
      if (block && block.type === "tool_use" && block.name) {
        bucket[block.name] = (bucket[block.name] || 0) + 1;
      }
    }
  }

  const lines = [];
  const m = phrase(main);
  if (m) lines.push(m);
  const s = phrase(side);
  if (s) lines.push(`subagents: ${s}`);
  return lines;
}

module.exports = { activitySummary };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hook/lib.activity.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add hook/_lib/activity.js test/hook/lib.activity.test.ts
git commit -m "feat(hooks): summarise a turn's tool activity from the transcript tail"
```

---

### Task 4: Composer and line budget (hook side)

**Files:**
- Create: `hook/_lib/compose.js`
- Test: `test/hook/lib.compose.test.ts`

The seam. Everything above feeds this; everything below consumes it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";

const { compose, EVENTS } = await import("../../hook/_lib/compose");

describe("hook/_lib/compose", () => {
  it("builds a title from workspace and event", () => {
    const { title } = compose({ workspace: "claude-notifier", event: EVENTS.DONE });
    expect(title).toBe("claude-notifier | ✅ finished");
  });

  it("falls back to the default title with no workspace", () => {
    expect(compose({ workspace: "", event: EVENTS.DONE }).title).toBe("Claude Notifier");
  });

  it("puts the chat title in bullets above a blank line", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Review two new contributor PRs",
      detail: ["ran 5 commands"],
    });
    expect(body).toBe("• Review two new contributor PRs •\n\nran 5 commands");
  });

  it("caps the chat title at 36 when two detail lines are present", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Optimize Stellaris empire build and tech progression",
      detail: ["ran 5 commands", "subagents: read 12 files"],
    });
    const first = body.split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(40);
    expect(first.endsWith("… •")).toBe(true);
  });

  it("allows a longer chat title when only one detail line is present", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Optimize Stellaris empire build and tech progression",
      detail: ["ran 5 commands"],
    });
    expect(body.split("\n")[0]).toBe("• Optimize Stellaris empire build and tech progression •");
  });

  it("omits the chat line entirely when no title resolves", () => {
    const { body } = compose({ workspace: "ws", event: EVENTS.DONE, detail: ["ran 5 commands"] });
    expect(body).toBe("ran 5 commands");
  });

  it("falls back to the plain sentence when there is no detail", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Some chat",
      fallback: "Claude has finished the task.",
    });
    expect(body).toBe("• Some chat •\n\nClaude has finished the task.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hook/lib.compose.test.ts`
Expected: FAIL — `Cannot find module '../../hook/_lib/compose'`

- [ ] **Step 3: Write the implementation**

```js
const DEFAULT_TITLE = "Claude Notifier";

// Single-codepoint glyphs only. Variation-selector emoji such as ⚠️ are two
// codepoints and render inconsistently across platforms.
const EVENTS = {
  DONE: "✅ finished",
  PERMISSION: "❗ needs permission",
  QUESTION: "❓ question",
  SUBAGENT: "✅ subagent finished",
};

// Measured on a macOS banner: ~40 chars per line, exactly four body lines.
const LINE = 40;
const BODY_LINES = 4;
const CHROME = 4; // "• " and " •"

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

/**
 * Assemble the banner. The frame cannot fix per-element caps independently of
 * content, so it allocates: the detail block takes the lines it needs and the
 * chat title claims whatever is left.
 *
 * Plain characters deliberately — Unicode maths-bold renders on macOS but
 * screen readers announce those codepoints as symbols and copied text stops
 * matching the real session name.
 */
function compose({ workspace, event, chatTitle, detail = [], fallback = "" } = {}) {
  const title = workspace ? `${workspace} | ${event}` : DEFAULT_TITLE;

  const detailLines = detail.length ? detail : fallback ? [fallback] : [];
  const spare = Math.max(1, BODY_LINES - detailLines.length - (detailLines.length ? 1 : 0));
  const cap = spare * LINE - CHROME;

  const parts = [];
  if (chatTitle) parts.push(`• ${truncate(chatTitle, cap)} •`);
  if (detailLines.length) {
    if (parts.length) parts.push("");
    parts.push(...detailLines);
  }
  return { title, body: parts.join("\n") };
}

module.exports = { compose, EVENTS, DEFAULT_TITLE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hook/lib.compose.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add hook/_lib/compose.js test/hook/lib.compose.test.ts
git commit -m "feat(hooks): compose notification title and body within the line budget"
```

---

### Task 5: Wire the Stop hook

**Files:**
- Modify: `hook/claude-notifier-on-stop.js:65-75`
- Test: `test/hook/on-stop.test.ts` (existing — must still pass)

Do this one hook first and confirm the shape before repeating it. The `opts.title` plumbing already exists from #87.

- [ ] **Step 1: Replace the notification call**

Current:

```js
showNotification(`${agentLabel()} has finished the task.`, {
  title: titleForCwd(cwd),
  preferTerminalNotifier: true,
  executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
});
```

Replacement:

```js
const chatTitle = sessionTitle({
  transcriptPath: input.transcript_path,
  sessionId: input.session_id,
  cwd,
  agent: agentId(),
});
const prose = doneDetail(input.last_assistant_message);
const detail = prose ? [prose] : activitySummary(input.transcript_path);
const { title, body } = compose({
  workspace: titleForCwd(cwd),
  event: EVENTS.DONE,
  chatTitle,
  detail,
  fallback: `${agentLabel()} has finished the task.`,
});
showNotification(body, {
  title,
  preferTerminalNotifier: true,
  executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
});
```

Add the imports at the top, beside the existing ones:

```js
const { sessionTitle } = require("./_lib/session-label");
const { doneDetail } = require("./_lib/detail");
const { activitySummary } = require("./_lib/activity");
const { compose, EVENTS } = require("./_lib/compose");
const { agentId } = require("./_lib/agent");
```

- [ ] **Step 2: Run the existing hook tests**

Run: `npx vitest run test/hook/on-stop.test.ts`
Expected: PASS — these assert signal writing, not notification text, so they should be unaffected. If any fail, the failure is real; fix it before continuing.

- [ ] **Step 3: Fire a real banner**

```bash
echo '{"session_id":"'"$(basename ~/.claude/projects/*/*.jsonl .jsonl | head -1)"'","cwd":"'"$PWD"'","last_assistant_message":"Shipped 3.7.1 and filed two follow-up issues."}' \
  | node hook/claude-notifier-on-stop.js
```

Expected banner:

```
[claude-notifier | ✅ finished]
• <a real chat title> •

Shipped 3.7.1 and filed two follow-up issues.
```

- [ ] **Step 4: Commit**

```bash
git add hook/claude-notifier-on-stop.js
git commit -m "feat(hooks): name the session and what it did in stop notifications"
```

---

### Task 6: Wire the remaining JS hooks

**Files:**
- Modify: `hook/claude-notifier-on-permission.js`
- Modify: `hook/claude-notifier-on-question.js`
- Modify: `hook/claude-notifier-on-subagent-stop.js`
- Modify: `hook/claude-notifier-on-notification.js`

Same shape as Task 5, with the event and detail source swapped per hook.

⚠️ `claude-notifier-on-notification.js` is in the repo but is **not deployed or registered** — `"Notification"` appears in `src/hooks/registry.ts` only under `ALL_HOOK_TYPES` ("used for cleanup") and in `teardownHooks`. Wire it for consistency, but it will never fire. Do not debug that.

- [ ] **Step 1: Permission hook**

```js
const { title, body } = compose({
  workspace: titleForCwd(cwd),
  event: EVENTS.PERMISSION,
  chatTitle: sessionTitle({
    transcriptPath: input.transcript_path,
    sessionId: input.session_id,
    cwd,
    agent: agentId(),
  }),
  detail: [permissionDetail(input)].filter(Boolean),
  fallback: `${agentLabel()} needs permission to use ${tool}.`,
});
showNotification(body, {
  title,
  preferTerminalNotifier: true,
  executeCmd: buildClickAction(cwd) || GENERIC_ACTIVATE,
});
```

- [ ] **Step 2: Question hook** — identical, with `EVENTS.QUESTION`, `questionDetail(input)`, and fallback `` `${agentLabel()} is asking you a question.` ``

- [ ] **Step 3: Subagent hook** — `EVENTS.SUBAGENT`, `detail: []`, fallback `` `${agentLabel()} subagent finished.` ``

- [ ] **Step 4: Notification hook** — `EVENTS.PERMISSION`, `detail: []`, fallback `input.message || "Claude needs your permission."`

- [ ] **Step 5: Run the hook suite**

Run: `npm run test:hook`
Expected: PASS, all existing tests

- [ ] **Step 6: Commit**

```bash
git add hook/claude-notifier-on-*.js
git commit -m "feat(hooks): apply composed notifications to every event"
```

---

### Task 7: Extension side

**Files:**
- Create: `src/signals/session-label.ts`
- Create: `src/notifications/compose.ts`
- Modify: `src/notifications/local.ts:10-14`
- Test: `test/unit/notifications.compose.test.ts`

Port `session-label.js` and `compose.js` to TypeScript, keeping behaviour identical — they are a parallel pair, like `src/routing/cwd.ts` and `hook/_lib/active.js`.

**The extension has no `last_assistant_message`** — that field is on hook stdin only. So its detail comes from `activitySummary` alone. Port that too, or export it from a shared location if you prefer; the plan assumes a port.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { compose, EVENTS } from "../../src/notifications/compose";

describe("notifications/compose", () => {
  it("matches the hook composer's title format", () => {
    expect(compose({ workspace: "ws", event: EVENTS.DONE }).title).toBe("ws | ✅ finished");
  });

  it("omits the chat line when no title resolves", () => {
    expect(compose({ workspace: "ws", event: EVENTS.DONE, detail: ["ran 1 command"] }).body).toBe(
      "ran 1 command"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/notifications.compose.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Port both modules to TypeScript**

`src/notifications/compose.ts` is a direct translation of `hook/_lib/compose.js` with types added:

```ts
export const DEFAULT_TITLE = "Claude Notifier";

export const EVENTS = {
  DONE: "✅ finished",
  PERMISSION: "❗ needs permission",
  QUESTION: "❓ question",
  SUBAGENT: "✅ subagent finished",
} as const;

const LINE = 40;
const BODY_LINES = 4;
const CHROME = 4;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

export interface ComposeInput {
  workspace?: string;
  event: string;
  chatTitle?: string;
  detail?: string[];
  fallback?: string;
}

export function compose({
  workspace,
  event,
  chatTitle,
  detail = [],
  fallback = "",
}: ComposeInput): { title: string; body: string } {
  const title = workspace ? `${workspace} | ${event}` : DEFAULT_TITLE;
  const detailLines = detail.length ? detail : fallback ? [fallback] : [];
  const spare = Math.max(1, BODY_LINES - detailLines.length - (detailLines.length ? 1 : 0));
  const cap = spare * LINE - CHROME;

  const parts: string[] = [];
  if (chatTitle) parts.push(`• ${truncate(chatTitle, cap)} •`);
  if (detailLines.length) {
    if (parts.length) parts.push("");
    parts.push(...detailLines);
  }
  return { title, body: parts.join("\n") };
}
```

`src/signals/session-label.ts` is a direct translation of `hook/_lib/session-label.js`. It needs `PROJECTS_DIR`, which `src/paths.ts` does **not** export yet — add it there first, beside the existing `CLAUDE_DIR`:

```ts
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
```

Also port `activitySummary` from `hook/_lib/activity.js`; the extension has no `last_assistant_message` (that field is hook-stdin only), so the activity summary is its only detail source for the done event.

- [ ] **Step 4: Wire `local.ts`**

`showLocalNotification` currently computes `const title = getWorkspaceTitle(cwd);` and uses `message` as-is. Change its signature to accept the composed pair, and have `dispatch.ts`'s existing `showLocalNotification(message, cwd)` call site pass composed values. **Do not touch the four `showInformationMessage` calls.**

- [ ] **Step 5: Run the unit suite**

Run: `npm run test:unit && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ test/unit/notifications.compose.test.ts
git commit -m "feat: compose session-named notifications on the extension side"
```

---

### Task 8: PowerShell hooks

**Files:**
- Modify: `hook/_lib.ps1`
- Modify: the five `hook/claude-notifier-on-*.ps1`

⚠️ **There is no PowerShell test coverage anywhere in this repo**, so the Windows CI arm will not validate this. Review by inspection and mirror the JS exactly.

Watch the existing variable convention: `on-stop.ps1` and `on-subagent-stop.ps1` define a local `$cwd`; the other three read `$data.cwd`.

- [ ] **Step 1: Add `Get-NotifierBody` to `_lib.ps1`**

```powershell
# Mirrors compose() in hook/_lib/compose.js. Keep the two in sync.
function Get-NotifierBody([string]$ChatTitle, [string[]]$Detail, [string]$Fallback) {
    $lines = @()
    $detailLines = if ($Detail -and $Detail.Count -gt 0) { $Detail } elseif ($Fallback) { @($Fallback) } else { @() }
    $spare = [Math]::Max(1, 4 - $detailLines.Count - $(if ($detailLines.Count -gt 0) { 1 } else { 0 }))
    $cap = $spare * 40 - 4
    if ($ChatTitle) {
        $t = if ($ChatTitle.Length -gt $cap) { $ChatTitle.Substring(0, $cap - 1) + [char]0x2026 } else { $ChatTitle }
        $lines += "$([char]0x2022) $t $([char]0x2022)"
    }
    if ($detailLines.Count -gt 0) {
        if ($lines.Count -gt 0) { $lines += "" }
        $lines += $detailLines
    }
    return ($lines -join "`n")
}
```

- [ ] **Step 2: Update each `.ps1` call site** to pass `-Title "$ws | $emoji $event"` and the composed body. PowerShell single-quote escaping is already handled by the existing doubling helper — do not add another layer.

- [ ] **Step 3: Commit**

```bash
git add hook/_lib.ps1 hook/claude-notifier-on-*.ps1
git commit -m "feat(hooks): mirror composed notifications in the PowerShell hooks"
```

---

### Task 9: End-to-end verification

**Files:** none — this task only runs things.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all green

- [ ] **Step 2: Smoke**

Run: `npm run smoke`
Expected: green (macOS only)

- [ ] **Step 3: Check test fixtures for the `path.sep` trap**

```bash
grep -rn '"/Users/\|"/proj\|"/x"' test/unit test/hook | grep -v path.join
```

Expected: no hits in any test that exercises `cwdMatchesFolder`. Hardcoded forward slashes pass on macOS and fail on Windows — this is what broke `main` in `acca8b5`.

- [ ] **Step 4: Fire all four events and confirm against the budget**

```bash
node -e '
const { showNotification } = require("./hook/_lib/notify.js");
const { compose, EVENTS } = require("./hook/_lib/compose.js");
const chat = "Review two new contributor PRs";
const cases = [
  [EVENTS.DONE,       ["ran 5 commands · edited 2 files", "subagents: read 12 files"]],
  [EVENTS.PERMISSION, ["Bash: rm -f /Users/ashmit/probe.txt"]],
  [EVENTS.QUESTION,   ["1. Banner format", "2. Question body"]],
  [EVENTS.SUBAGENT,   []],
];
for (const [event, detail] of cases) {
  const { title, body } = compose({ workspace: "claude-notifier", event, chatTitle: chat, detail });
  showNotification(body, { title });
}
'
```

Expected, for each banner: the title renders whole, the chat line sits in `• •` above a blank line, the detail occupies its allocated lines, and nothing clips mid-word.

- [ ] **Step 5: Commit anything outstanding and open the PR**

```bash
git push -u origin feat/notification-rework
gh pr create --title "feat: name the session and what it did in every notification" --body "Implements the plan in docs/superpowers/plans/2026-08-22-notification-rework.md"
```

---

## Self-review notes

- **Codex** is handled in exactly one place — `sessionTitle` short-circuits on `agent === "codex"`, so Codex sessions get the workspace-only title that 4.0.0 already ships.
- **Naming is consistent** across tasks: `sessionTitle`, `doneDetail`, `permissionDetail`, `questionDetail`, `activitySummary`, `compose`, `EVENTS`.
- **Emoji are hardcoded** in `compose.js`/`compose.ts` only, so making them configurable later is a change to one constant plus the settings plumbing.
- **The toast is untouched** in every task that goes near `dispatch.ts`.

// Mirror of hook/_lib/session-label.js and hook/_lib/activity.js. The
// extension and the hooks are parallel implementations, like src/routing/cwd.ts
// and hook/_lib/active.js — keep the pairs in sync.
import * as fs from "fs";
import * as path from "path";
import { PROJECTS_DIR } from "../paths";

const MAX_TITLE = 70;
// ai-title and custom-title are both written near the start of a transcript
// while transcripts reach tens of MB, so only the head is read.
const HEAD_BYTES = 512 * 1024;
// The turn's tool calls sit at the END of the transcript, so the activity
// summary reads the tail instead.
const TAIL_BYTES = 256 * 1024;

interface Record_ {
  type?: string;
  aiTitle?: string;
  customTitle?: string;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

function collapse(value: string): string {
  const flat = String(value).replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

function readSlice(filePath: string, bytes: number, fromEnd: boolean): string {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    const start = fromEnd ? Math.max(0, size - bytes) : 0;
    const length = fromEnd ? size - start : Math.min(size, bytes);
    const buf = Buffer.allocUnsafe(length);
    fs.readSync(fd, buf, 0, length, start);
    const text = buf.toString("utf-8");
    // Drop the partial first line when a tail read started mid-file.
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

function parseLines(text: string): Record_[] {
  const recs: Record_[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      recs.push(JSON.parse(line) as Record_);
    } catch {
      /* partial or malformed line */
    }
  }
  return recs;
}

function messageText(rec: Record_): string {
  const c = rec && rec.message && rec.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const block = (c as { type?: string; text?: string }[]).find((b) => b && b.type === "text");
    return (block && block.text) || "";
  }
  return "";
}

function scan(text: string): string {
  const recs = parseLines(text);
  // A user rename writes custom-title; Claude Code's own hydration is
  // `if (customTitle) currentSessionTitle ??= customTitle`, so it wins.
  for (let i = recs.length - 1; i >= 0; i--) {
    const rec = recs[i];
    if (rec && rec.type === "custom-title" && rec.customTitle) return collapse(rec.customTitle);
  }
  for (let i = recs.length - 1; i >= 0; i--) {
    const rec = recs[i];
    if (rec && rec.type === "ai-title" && rec.aiTitle) return collapse(rec.aiTitle);
  }
  // A session too young to have been titled yet.
  for (const rec of recs) {
    if (rec.type !== "user") continue;
    const t = messageText(rec);
    // Skip injected <system-reminder> / <ide_selection> turns.
    if (t && !t.trimStart().startsWith("<")) return collapse(t);
  }
  return "";
}

/** Locate a transcript. The slug guess covers the normal case; the scan is the fallback. */
export function findTranscript(
  sessionId?: string,
  cwd?: string,
  projectsDir: string = PROJECTS_DIR
): string {
  if (!sessionId || sessionId === "-") return "";
  const fileName = `${sessionId}.jsonl`;
  if (cwd) {
    // Split on BOTH separators — a bare /\//g misses Windows paths entirely
    // and forces a full directory scan on every notification.
    const slug = String(cwd)
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("-");
    const guess = path.join(projectsDir, `-${slug}`, fileName);
    try {
      if (fs.existsSync(guess)) return guess;
    } catch {
      /* unreadable */
    }
  }
  try {
    for (const entry of fs.readdirSync(projectsDir)) {
      const candidate = path.join(projectsDir, entry, fileName);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* no projects dir */
  }
  return "";
}

export interface SessionTitleInput {
  transcriptPath?: string;
  sessionId?: string;
  cwd?: string;
  projectsDir?: string;
}

/** The chat title for a session, or "" when none resolves. */
export function sessionTitle({
  transcriptPath,
  sessionId,
  cwd,
  projectsDir,
}: SessionTitleInput = {}): string {
  let file = transcriptPath;
  if (!file || !fs.existsSync(file)) file = findTranscript(sessionId, cwd, projectsDir);
  if (!file) return "";
  return scan(readSlice(file, HEAD_BYTES, false));
}

// Priority order, not frequency: "edited 3 files" is worth reporting over
// "read 12 files" even when reads dominate the count.
const VERBS: [string, string, string][] = [
  ["Edit", "edited", "file"],
  ["Write", "wrote", "file"],
  ["Bash", "ran", "command"],
  ["Task", "ran", "subagent"],
  ["WebFetch", "fetched", "page"],
  ["Read", "read", "file"],
  ["Grep", "searched", "time"],
  ["Glob", "searched", "time"],
];

function userText(rec: Record_): string {
  const c = rec && rec.message && rec.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return (c as { text?: string }[]).map((b) => (b && b.text) || "").join(" ");
  }
  return "";
}

function phrase(counts: Record<string, number>): string {
  const parts: string[] = [];
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

/**
 * Up to two lines: main-thread work, then subagent work. This is the
 * extension's only detail source for the done event — last_assistant_message
 * is on hook stdin and never reaches the extension.
 */
export function activitySummary(transcriptPath?: string): string[] {
  if (!transcriptPath) return [];
  const recs = parseLines(readSlice(transcriptPath, TAIL_BYTES, true));

  // The boundary is the last REAL user turn. Injected <system-reminder> and
  // <ide_selection> blocks are also type "user" and would reset it constantly.
  let start = 0;
  recs.forEach((rec, i) => {
    if (rec.type === "user") {
      const t = userText(rec).trim();
      if (t && !t.startsWith("<")) start = i;
    }
  });

  const main: Record<string, number> = {};
  const side: Record<string, number> = {};
  for (const rec of recs.slice(start)) {
    const c = rec.message && rec.message.content;
    if (!Array.isArray(c)) continue;
    const bucket = rec.isSidechain ? side : main;
    for (const block of c as { type?: string; name?: string }[]) {
      if (block && block.type === "tool_use" && block.name) {
        bucket[block.name] = (bucket[block.name] || 0) + 1;
      }
    }
  }

  const lines: string[] = [];
  const m = phrase(main);
  if (m) lines.push(m);
  const s = phrase(side);
  if (s) lines.push(`subagents: ${s}`);
  return lines;
}

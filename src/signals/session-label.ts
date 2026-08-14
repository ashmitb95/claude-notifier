import * as fs from "fs";
import * as path from "path";
import { PROJECTS_DIR } from "../paths";

/**
 * Resolves a short label identifying WHICH Claude session an event came from,
 * e.g. "my-repo · Fix the flaky login test".
 *
 * Claude Code writes an `ai-title` record into the session transcript at
 * ~/.claude/projects/<slugged-cwd>/<session-id>.jsonl. That string is what its
 * own session picker shows, so a label built from it maps directly onto the tab
 * or session the user needs to open.
 *
 * Every function here fails soft and returns null/"" rather than throwing: the
 * transcript layout is a Claude Code implementation detail, so callers must be
 * able to fall back to an unlabelled message.
 *
 * hook/_lib/session-label.js is the parallel implementation used by the hook
 * scripts, mirroring the src/routing/cwd.ts <-> hook/_lib/active.js split. Keep
 * the two in sync.
 */

const MAX_TITLE = 70;
/**
 * Both the ai-title and the first user message are written near the start of a
 * transcript, while transcripts themselves reach tens of MB. Reading only the
 * head keeps this at ~1ms instead of ~110ms on a 28MB file, which matters
 * because the extension calls it on the host thread for every notification.
 */
const HEAD_BYTES = 512 * 1024;
const MAX_FULL_READ_BYTES = 64 * 1024 * 1024;

export interface SessionLabelInput {
  cwd?: string;
  sessionId?: string | null;
  /** Passed by Claude Code on hook stdin. Saves having to locate the file. */
  transcriptPath?: string;
  /** Override for tests. Defaults to ~/.claude/projects. */
  projectsDir?: string;
}

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function collapse(value: string): string {
  const flat = String(value).replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

/** Read at most `limit` bytes from the front of a file. */
function readHead(filePath: string, limit: number): { text: string; truncated: boolean } | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, limit);
    const buf = Buffer.allocUnsafe(length);
    fs.readSync(fd, buf, 0, length, 0);
    return { text: buf.toString("utf-8"), truncated: size > length };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function scanForTitle(text: string): string | null {
  const lines = text.split("\n");

  // Last ai-title wins: a long session can be re-titled. The substring test
  // avoids JSON.parse on every line of a large transcript.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.includes('"ai-title"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === "ai-title" && parsed.aiTitle) return collapse(parsed.aiTitle);
    } catch {
      /* skip malformed line */
    }
  }

  // Fallback for a session too young to have been titled yet.
  for (const line of lines) {
    if (!line.includes('"type":"user"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type !== "user" || !parsed.message) continue;
      const content = parsed.message.content;
      const text2: string =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? (content.find((c: { type?: string }) => c?.type === "text")?.text ?? "")
            : "";
      // Skip injected <system-reminder> / <ide_selection> style turns.
      if (text2 && !text2.trimStart().startsWith("<")) return collapse(text2);
    } catch {
      /* skip malformed line */
    }
  }
  return null;
}

/** The session's ai-title, else the first thing the user typed, else null. */
export function readSessionTitle(transcriptPath: string): string | null {
  const head = readHead(transcriptPath, HEAD_BYTES);
  if (!head) return null;

  const fromHead = scanForTitle(head.text);
  if (fromHead) return fromHead;
  if (!head.truncated) return null;

  // Nothing identifying in the head of a large file: pay for the full read.
  try {
    if (fs.statSync(transcriptPath).size > MAX_FULL_READ_BYTES) return null;
    return scanForTitle(fs.readFileSync(transcriptPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Locate a session transcript. The slug guess covers the normal case; the
 * directory scan is the fallback for any cwd Claude Code slugs differently.
 */
export function findTranscript(
  sessionId: string,
  cwd?: string,
  projectsDir: string = PROJECTS_DIR
): string | null {
  if (!sessionId || sessionId === "-") return null;
  const fileName = `${sessionId}.jsonl`;

  if (cwd) {
    const guess = path.join(projectsDir, cwd.replace(/\//g, "-"), fileName);
    if (exists(guess)) return guess;
  }
  let entries: string[];
  try {
    entries = fs.readdirSync(projectsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const candidate = path.join(projectsDir, entry, fileName);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * "<project> · <session title>", or just "<project>" when no title resolves,
 * or "" when there is nothing to go on. Callers treat "" as "use the plain,
 * unlabelled message" so behaviour is unchanged when a transcript is missing.
 */
export function buildSessionLabel(input: SessionLabelInput): string {
  const { cwd, sessionId, transcriptPath, projectsDir = PROJECTS_DIR } = input;
  const project = cwd ? path.basename(cwd.replace(/[\\/]+$/, "")) : "";

  const transcript =
    transcriptPath && exists(transcriptPath)
      ? transcriptPath
      : sessionId
        ? findTranscript(sessionId, cwd, projectsDir)
        : null;
  const title = transcript ? readSessionTitle(transcript) : null;

  if (project && title) return `${project} · ${title}`;
  return title || project || "";
}

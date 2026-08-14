const fs = require("fs");
const path = require("path");
const { PROJECTS_DIR } = require("./paths");

/**
 * Resolves a short label identifying WHICH Claude session an event came from,
 * e.g. "my-repo · Fix the flaky login test".
 *
 * Claude Code writes an `ai-title` record into the session transcript at
 * ~/.claude/projects/<slugged-cwd>/<session-id>.jsonl. That string is what its
 * own session picker shows, so a label built from it maps directly onto the tab
 * or session the user needs to open.
 *
 * Fails soft everywhere and returns null/"" rather than throwing: the transcript
 * layout is a Claude Code implementation detail, so callers must be able to fall
 * back to an unlabelled message.
 *
 * Parallel implementation of src/signals/session-label.ts, mirroring the
 * src/routing/cwd.ts <-> hook/_lib/active.js split. Keep the two in sync.
 */

const MAX_TITLE = 70;
// The head-only read keeps this at ~1ms rather than ~110ms on a 28MB
// transcript. Both signals we look for are written near the start of a session.
const HEAD_BYTES = 512 * 1024;
const MAX_FULL_READ_BYTES = 64 * 1024 * 1024;

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function collapse(value) {
  const flat = String(value).replace(/\s+/g, " ").trim();
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

function readHead(filePath, limit) {
  let fd;
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
      } catch {}
    }
  }
}

function scanForTitle(text) {
  const lines = text.split("\n");

  // Last ai-title wins: a long session can be re-titled. The substring test
  // avoids JSON.parse on every line of a large transcript.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"ai-title"')) continue;
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && parsed.type === "ai-title" && parsed.aiTitle) return collapse(parsed.aiTitle);
    } catch {}
  }

  // Fallback for a session too young to have been titled yet.
  for (const line of lines) {
    if (!line.includes('"type":"user"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || parsed.type !== "user" || !parsed.message) continue;
      const content = parsed.message.content;
      const text2 =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? (content.find((c) => c && c.type === "text") || {}).text || ""
            : "";
      // Skip injected <system-reminder> / <ide_selection> style turns.
      if (text2 && !text2.trimStart().startsWith("<")) return collapse(text2);
    } catch {}
  }
  return null;
}

/** The session's ai-title, else the first thing the user typed, else null. */
function readSessionTitle(transcriptPath) {
  const head = readHead(transcriptPath, HEAD_BYTES);
  if (!head) return null;

  const fromHead = scanForTitle(head.text);
  if (fromHead) return fromHead;
  if (!head.truncated) return null;

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
function findTranscript(sessionId, cwd, projectsDir = PROJECTS_DIR) {
  if (!sessionId || sessionId === "-") return null;
  const fileName = `${sessionId}.jsonl`;

  if (cwd) {
    const guess = path.join(projectsDir, String(cwd).replace(/\//g, "-"), fileName);
    if (exists(guess)) return guess;
  }
  let entries;
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
 * "<project> · <session title>", or just "<project>" when no title resolves, or
 * "" when there is nothing to go on. Callers treat "" as "use the plain,
 * unlabelled message" so behaviour is unchanged when a transcript is missing.
 */
function buildSessionLabel(input = {}) {
  const { cwd, sessionId, transcriptPath, projectsDir = PROJECTS_DIR } = input;
  const project = cwd ? path.basename(String(cwd).replace(/[\\/]+$/, "")) : "";

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

/**
 * "<label> · <suffix>" for a hook's stdin payload, falling back to `unlabelled`
 * when no session label resolves. Keeps each hook script to a single call.
 */
function labelledMessage(input, suffix, unlabelled) {
  const label = buildSessionLabel({
    cwd: (input && input.cwd) || process.cwd() || "",
    sessionId: input && input.session_id,
    transcriptPath: input && input.transcript_path,
  });
  return label ? `${label} · ${suffix}` : unlabelled;
}

module.exports = { buildSessionLabel, labelledMessage, readSessionTitle, findTranscript };

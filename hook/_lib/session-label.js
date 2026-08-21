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
    const slug = String(cwd)
      .split(/[\\/]+/)
      .filter(Boolean)
      .join("-");
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

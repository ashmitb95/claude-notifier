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

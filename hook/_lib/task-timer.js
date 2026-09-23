const fs = require("fs");
const path = require("path");
const { TASK_START_DIR } = require("./paths");

const ANON_SESSION = "__anon__";

function safeSessionId(sessionId) {
  if (!sessionId) return ANON_SESSION;
  let cleaned = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "");
  cleaned = cleaned.replace(/\.{2,}/g, "");
  return cleaned.length > 0 ? cleaned : ANON_SESSION;
}

function markerPath(sessionId) {
  return path.join(TASK_START_DIR, `${safeSessionId(sessionId)}.json`);
}

function recordTaskStart(sessionId, promptId) {
  try {
    fs.mkdirSync(TASK_START_DIR, { recursive: true });
    fs.writeFileSync(
      markerPath(sessionId),
      JSON.stringify({
        startedAt: Date.now(),
        sessionId: safeSessionId(sessionId),
        promptId: promptId ?? null,
      })
    );
  } catch {}
}

/** The prompt_id of the turn currently in flight, or null. */
function getPromptId(sessionId) {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath(sessionId), "utf-8"));
    return typeof data.promptId === "string" ? data.promptId : null;
  } catch {
    return null;
  }
}

function getStartTime(sessionId) {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath(sessionId), "utf-8"));
    return typeof data.startedAt === "number" ? data.startedAt : null;
  } catch {
    return null;
  }
}

function shouldSuppressForThreshold(sessionId, thresholdSec) {
  const t = Number(thresholdSec);
  if (!Number.isFinite(t) || t <= 0) return false;
  const started = getStartTime(sessionId);
  if (started === null) return false; // Fail open.
  return Date.now() - started < t * 1000;
}

module.exports = { recordTaskStart, getPromptId, getStartTime, shouldSuppressForThreshold };

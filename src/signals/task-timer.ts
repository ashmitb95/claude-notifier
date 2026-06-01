import * as fs from "fs";
import * as path from "path";
import { TASK_START_DIR } from "../paths";

const ANON_SESSION = "__anon__";

function safeSessionId(sessionId: string | null | undefined): string {
  if (!sessionId) return ANON_SESSION;
  // Strip anything that could escape the directory or break filename rules.
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "").replace(/\.{2,}/g, "");
  return cleaned.length > 0 ? cleaned : ANON_SESSION;
}

function markerPath(sessionId: string | null | undefined): string {
  return path.join(TASK_START_DIR, `${safeSessionId(sessionId)}.json`);
}

export function recordTaskStart(sessionId: string | null | undefined): void {
  try {
    fs.mkdirSync(TASK_START_DIR, { recursive: true });
    const payload = JSON.stringify({
      startedAt: Date.now(),
      sessionId: safeSessionId(sessionId),
    });
    fs.writeFileSync(markerPath(sessionId), payload);
  } catch {
    // Marker is best-effort; failure should never break the prompt hook.
  }
}

export function getStartTime(sessionId: string | null | undefined): number | null {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath(sessionId), "utf-8"));
    return typeof data.startedAt === "number" ? data.startedAt : null;
  } catch {
    return null;
  }
}

export function shouldSuppressForThreshold(
  sessionId: string | null | undefined,
  thresholdSec: number
): boolean {
  if (!Number.isFinite(thresholdSec) || thresholdSec <= 0) return false;
  const started = getStartTime(sessionId);
  if (started === null) return false; // Fail open.
  const elapsedMs = Date.now() - started;
  return elapsedMs < thresholdSec * 1000;
}

export function deleteMarker(sessionId: string | null | undefined): void {
  try {
    fs.unlinkSync(markerPath(sessionId));
  } catch {}
}

export function cleanupStaleMarkers(maxAgeMs: number): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(TASK_START_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    const full = path.join(TASK_START_DIR, entry);
    try {
      const data = JSON.parse(fs.readFileSync(full, "utf-8"));
      if (typeof data.startedAt === "number" && data.startedAt < cutoff) {
        fs.unlinkSync(full);
      }
    } catch {}
  }
}

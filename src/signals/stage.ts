import { log } from "../log";

/**
 * Per-session stage state machine.
 *
 * A "stage" is a logical user-facing task — bounded on one end by a user
 * prompt (UserPromptSubmit hook) and on the other end by the user's next
 * prompt or a long idle period.
 *
 * Within a stage, at most one notification fires per *reason* (`done`,
 * `input`, `question`). Subsequent events for the same reason in the same
 * stage are suppressed.
 *
 * Stage advances when:
 *   - The user submits a new prompt (UserPromptSubmit → primary).
 *   - A configurable idle window elapses without any signal (fallback for
 *     sessions that go quiet — e.g., user walked away).
 *
 * Session id comes from Claude Code's hook input JSON. When absent (older
 * hooks or odd input), an "anonymous" sentinel session is used; all
 * anonymous events share one stage, which is the conservative default.
 *
 * State is in-memory only — VS Code restart starts fresh. First event of
 * every session after restart fires normally.
 */

const ANON_SESSION = "__anon__";

interface SessionStage {
  /** Monotonic stage counter for this session. */
  stageId: number;
  /** Reasons already fired in the current stage. */
  fired: Set<string>;
  /** Last activity timestamp (ms). Used for idle-reset. */
  lastActivity: number;
  /** setTimeout handle for the idle reset, or null. */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, SessionStage>();

/**
 * Idle window before a stage auto-advances. UserPromptSubmit is the primary
 * advance trigger; this is the fallback for sessions that go quiet without
 * a new prompt (e.g., user walked away). 30 min covers most "I came back to
 * my desk" cases without being so short that mid-task pauses reset.
 */
const IDLE_RESET_MS = 30 * 60 * 1000;

function ensure(sid: string): SessionStage {
  let s = sessions.get(sid);
  if (!s) {
    s = { stageId: 0, fired: new Set(), lastActivity: Date.now(), idleTimer: null };
    sessions.set(sid, s);
  }
  return s;
}

function resolveSessionId(sessionId: string | null | undefined): string {
  return sessionId && sessionId.length > 0 ? sessionId : ANON_SESSION;
}

function armIdleTimer(sid: string, s: SessionStage): void {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    log(
      `[stage] session ${sid} advanced ${s.stageId}→${s.stageId + 1} (idle ${IDLE_RESET_MS / 60000}m)`
    );
    s.stageId += 1;
    s.fired.clear();
    s.idleTimer = null;
  }, IDLE_RESET_MS);
}

/**
 * Returns true when the (sessionId, reason) tuple should fire its
 * notification. Returns false when it should be suppressed (already fired
 * for this reason in the current stage).
 *
 * Side effects: records the fire if returning true; resets the idle timer
 * either way.
 */
export function shouldFire(sessionId: string | null | undefined, reason: string): boolean {
  const sid = resolveSessionId(sessionId);
  const s = ensure(sid);
  s.lastActivity = Date.now();
  armIdleTimer(sid, s);

  if (s.fired.has(reason)) {
    log(`[stage] session ${sid} ${reason} suppressed (stage ${s.stageId} already fired)`);
    return false;
  }
  s.fired.add(reason);
  log(`[stage] session ${sid} ${reason} fired (stage ${s.stageId})`);
  return true;
}

/**
 * Advance the stage for this session. Called on UserPromptSubmit (primary
 * advance trigger) and from the click-ack path on notifications.
 */
export function advance(sessionId: string | null | undefined): void {
  const sid = resolveSessionId(sessionId);
  const s = ensure(sid);
  const from = s.stageId;
  s.stageId += 1;
  s.fired.clear();
  s.lastActivity = Date.now();
  armIdleTimer(sid, s);
  log(`[stage] session ${sid} advanced ${from}→${s.stageId} (UserPromptSubmit)`);
}

/**
 * Tear down all per-session state. Called on extension deactivate so we
 * don't leak timers.
 */
export function reset(): void {
  for (const s of sessions.values()) {
    if (s.idleTimer) clearTimeout(s.idleTimer);
  }
  sessions.clear();
}

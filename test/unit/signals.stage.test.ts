import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stage from "../../src/signals/stage";

const IDLE_MS = 30 * 60 * 1000;

describe("stage", () => {
  beforeEach(() => {
    stage.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    stage.reset();
  });

  describe("shouldFire — coalescing within a stage", () => {
    it("first event for a session/reason fires", () => {
      expect(stage.shouldFire("s1", "done")).toBe(true);
    });

    it("second event with same session/reason suppresses", () => {
      stage.shouldFire("s1", "done");
      expect(stage.shouldFire("s1", "done")).toBe(false);
    });

    it("third+ events in same stage stay suppressed", () => {
      stage.shouldFire("s1", "done");
      stage.shouldFire("s1", "done");
      expect(stage.shouldFire("s1", "done")).toBe(false);
      expect(stage.shouldFire("s1", "done")).toBe(false);
    });

    it("different reasons in same stage each fire once", () => {
      expect(stage.shouldFire("s1", "done")).toBe(true);
      expect(stage.shouldFire("s1", "input")).toBe(true);
      expect(stage.shouldFire("s1", "question")).toBe(true);
      // But repeats of any one still suppress
      expect(stage.shouldFire("s1", "done")).toBe(false);
      expect(stage.shouldFire("s1", "input")).toBe(false);
    });
  });

  describe("session isolation", () => {
    it("parallel sessions don't interfere", () => {
      expect(stage.shouldFire("s1", "done")).toBe(true);
      expect(stage.shouldFire("s2", "done")).toBe(true); // separate session
      expect(stage.shouldFire("s1", "done")).toBe(false); // s1's stage still active
      expect(stage.shouldFire("s2", "done")).toBe(false); // s2's stage still active
    });

    it("null and missing session id fall to a single anonymous session", () => {
      expect(stage.shouldFire(null, "done")).toBe(true);
      expect(stage.shouldFire(undefined, "done")).toBe(false);
      expect(stage.shouldFire("", "done")).toBe(false); // empty string → anonymous
    });

    it("named session is distinct from anonymous", () => {
      expect(stage.shouldFire(null, "done")).toBe(true);
      expect(stage.shouldFire("s1", "done")).toBe(true);
    });
  });

  describe("advance — UserPromptSubmit / idle reset", () => {
    it("advance lets next event fire", () => {
      stage.shouldFire("s1", "done"); // first fires
      expect(stage.shouldFire("s1", "done")).toBe(false); // dedup'd
      stage.advance("s1");
      expect(stage.shouldFire("s1", "done")).toBe(true); // fires again
    });

    it("advance clears all reasons for the session", () => {
      stage.shouldFire("s1", "done");
      stage.shouldFire("s1", "input");
      stage.advance("s1");
      expect(stage.shouldFire("s1", "done")).toBe(true);
      expect(stage.shouldFire("s1", "input")).toBe(true);
    });

    it("advance on one session doesn't affect another", () => {
      stage.shouldFire("s1", "done");
      stage.shouldFire("s2", "done");
      stage.advance("s1");
      expect(stage.shouldFire("s1", "done")).toBe(true);
      expect(stage.shouldFire("s2", "done")).toBe(false); // s2 still in same stage
    });

    it("advance on a never-seen session is safe", () => {
      expect(() => stage.advance("never-seen")).not.toThrow();
      // And first event still fires
      expect(stage.shouldFire("never-seen", "done")).toBe(true);
    });
  });

  describe("idle reset", () => {
    it("auto-advances after idle window", () => {
      stage.shouldFire("s1", "done");
      expect(stage.shouldFire("s1", "done")).toBe(false);

      vi.advanceTimersByTime(IDLE_MS + 1);

      // After idle, next shouldFire should treat it as a fresh stage
      expect(stage.shouldFire("s1", "done")).toBe(true);
    });

    it("activity within idle window resets the timer", () => {
      stage.shouldFire("s1", "done");
      // Halfway through the idle window
      vi.advanceTimersByTime(IDLE_MS / 2);
      // Another event for same session — resets idle timer
      stage.shouldFire("s1", "input");
      // Now wait another half-window — total elapsed is IDLE_MS but only
      // half-window since last activity, so stage should NOT have advanced
      vi.advanceTimersByTime(IDLE_MS / 2);
      // Done should still be suppressed (same stage)
      expect(stage.shouldFire("s1", "done")).toBe(false);
    });

    it("advance arms a fresh idle timer", () => {
      stage.shouldFire("s1", "done");
      stage.advance("s1");
      // Just after advance, done fires (already verified). Now wait idle window.
      vi.advanceTimersByTime(IDLE_MS + 1);
      // Next event should be in a stage-after-the-advanced-one — fresh stage.
      // Re-firing done is allowed.
      expect(stage.shouldFire("s1", "done")).toBe(true);
    });
  });

  describe("reset", () => {
    it("clears all session state", () => {
      stage.shouldFire("s1", "done");
      stage.shouldFire("s2", "input");
      stage.reset();
      expect(stage.shouldFire("s1", "done")).toBe(true);
      expect(stage.shouldFire("s2", "input")).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The module under test reads TASK_START_DIR at import time via the paths
// module. We point HOME at a tmp dir BEFORE importing so paths resolve there.
let tmpRoot: string;
let tmpHooksDir: string;
let tmpTaskDir: string;

async function loadModule() {
  vi.resetModules();
  const mod = await import("../../src/signals/task-timer");
  return mod;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-timer-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("task-timer (extension side)", () => {
  describe("recordTaskStart", () => {
    it("writes a per-session marker with current timestamp", async () => {
      const { recordTaskStart } = await loadModule();
      const before = Date.now();
      recordTaskStart("sess-1");
      const after = Date.now();
      const file = path.join(tmpTaskDir, "sess-1.json");
      expect(fs.existsSync(file)).toBe(true);
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      expect(data.sessionId).toBe("sess-1");
      expect(data.startedAt).toBeGreaterThanOrEqual(before);
      expect(data.startedAt).toBeLessThanOrEqual(after);
    });

    it("uses __anon__ sentinel for missing session id", async () => {
      const { recordTaskStart } = await loadModule();
      recordTaskStart(null);
      expect(fs.existsSync(path.join(tmpTaskDir, "__anon__.json"))).toBe(true);
    });

    it("overwrites the per-session marker on subsequent calls", async () => {
      const { recordTaskStart } = await loadModule();
      recordTaskStart("sess-1");
      const first = JSON.parse(
        fs.readFileSync(path.join(tmpTaskDir, "sess-1.json"), "utf-8")
      ).startedAt;
      await new Promise((r) => setTimeout(r, 5));
      recordTaskStart("sess-1");
      const second = JSON.parse(
        fs.readFileSync(path.join(tmpTaskDir, "sess-1.json"), "utf-8")
      ).startedAt;
      expect(second).toBeGreaterThan(first);
    });

    it("parallel sessions get independent marker files", async () => {
      const { recordTaskStart } = await loadModule();
      recordTaskStart("sess-A");
      recordTaskStart("sess-B");
      expect(fs.existsSync(path.join(tmpTaskDir, "sess-A.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpTaskDir, "sess-B.json"))).toBe(true);
    });

    it("rejects path-traversal characters in session id", async () => {
      const { recordTaskStart } = await loadModule();
      recordTaskStart("../escape");
      // The marker, if written, must remain inside TASK_START_DIR.
      const written = fs.readdirSync(tmpTaskDir);
      for (const f of written) {
        expect(f.includes("..")).toBe(false);
        expect(f.includes("/")).toBe(false);
        expect(f.includes(path.sep)).toBe(false);
      }
    });
  });

  describe("shouldSuppressForThreshold", () => {
    it("returns false (fail open) when marker is missing", async () => {
      const { shouldSuppressForThreshold } = await loadModule();
      expect(shouldSuppressForThreshold("sess-missing", 10)).toBe(false);
    });

    it("returns false when threshold is 0 (feature off)", async () => {
      const { recordTaskStart, shouldSuppressForThreshold } = await loadModule();
      recordTaskStart("sess-1");
      expect(shouldSuppressForThreshold("sess-1", 0)).toBe(false);
    });

    it("returns true when elapsed < threshold", async () => {
      const { recordTaskStart, shouldSuppressForThreshold } = await loadModule();
      recordTaskStart("sess-1");
      // Marker written just now; threshold = 10s; elapsed ~ 0s → suppress.
      expect(shouldSuppressForThreshold("sess-1", 10)).toBe(true);
    });

    it("returns false when elapsed >= threshold", async () => {
      const { shouldSuppressForThreshold } = await loadModule();
      // Write a marker dated 20s ago.
      fs.mkdirSync(tmpTaskDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpTaskDir, "sess-1.json"),
        JSON.stringify({ startedAt: Date.now() - 20_000, sessionId: "sess-1" })
      );
      expect(shouldSuppressForThreshold("sess-1", 10)).toBe(false);
    });

    it("falls open when marker file is unreadable JSON", async () => {
      const { shouldSuppressForThreshold } = await loadModule();
      fs.mkdirSync(tmpTaskDir, { recursive: true });
      fs.writeFileSync(path.join(tmpTaskDir, "sess-corrupt.json"), "not json");
      expect(shouldSuppressForThreshold("sess-corrupt", 10)).toBe(false);
    });

    it("treats null session id as __anon__", async () => {
      const { recordTaskStart, shouldSuppressForThreshold } = await loadModule();
      recordTaskStart(null);
      expect(shouldSuppressForThreshold(null, 10)).toBe(true);
    });
  });

  describe("deleteMarker", () => {
    it("removes the per-session marker", async () => {
      const { recordTaskStart, deleteMarker } = await loadModule();
      recordTaskStart("sess-1");
      expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(true);
      deleteMarker("sess-1");
      expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(false);
    });

    it("is a no-op when marker doesn't exist", async () => {
      const { deleteMarker } = await loadModule();
      expect(() => deleteMarker("nope")).not.toThrow();
    });
  });

  describe("cleanupStaleMarkers", () => {
    it("removes markers older than maxAgeMs", async () => {
      const { cleanupStaleMarkers } = await loadModule();
      fs.mkdirSync(tmpTaskDir, { recursive: true });
      const oldFile = path.join(tmpTaskDir, "old.json");
      const freshFile = path.join(tmpTaskDir, "fresh.json");
      fs.writeFileSync(oldFile, JSON.stringify({ startedAt: Date.now() - 50_000, sessionId: "old" }));
      fs.writeFileSync(freshFile, JSON.stringify({ startedAt: Date.now() - 1_000, sessionId: "fresh" }));
      cleanupStaleMarkers(10_000);
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(freshFile)).toBe(true);
    });

    it("is a no-op when the directory doesn't exist", async () => {
      const { cleanupStaleMarkers } = await loadModule();
      fs.rmSync(tmpTaskDir, { recursive: true, force: true });
      expect(() => cleanupStaleMarkers(1)).not.toThrow();
    });
  });
});

# Sound Control Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Copilot-style anchored status-bar panel exposing volume / mute / threshold / per-event preview & preset swap, and a `minTaskDurationThreshold` setting that suppresses short-task notifications across every sound-emission path.

**Architecture:** Three layers shipped together as v3.3.0. Layer 2 (threshold) is independent infrastructure built first via TDD. Layer 3 (preview + preset swap commands) builds on existing sound playback. Layer 1 (panel) wires Layer 2 + 3 into a `MarkdownString` tooltip on the existing status bar item. Per-session marker files (`~/.claude/hooks/claude-notifier-task-start/<sessionId>.json`) carry the prompt-submit timestamp; helpers in both `src/signals/task-timer.ts` and `hook/_lib/task-timer.js` enforce suppression with fail-open semantics.

**Tech Stack:** TypeScript 5.3, VS Code extension API ≥1.85, Node ≥18, Vitest 4.x, PowerShell 5+ for Windows hook parity.

**Spec:** [docs/superpowers/specs/2026-05-24-sound-control-surface-design.md](../specs/2026-05-24-sound-control-surface-design.md)

---

## File Structure

### Phase 1 — Threshold (Layer 2)

| File | New / Mod | Responsibility |
|------|-----------|----------------|
| `src/paths.ts` | mod | Add `TASK_START_DIR` constant |
| `src/signals/task-timer.ts` | new | Extension-side marker helpers |
| `test/unit/signals.task-timer.test.ts` | new | Unit tests for the helpers |
| `hook/_lib/task-timer.js` | new | Hook-side marker helpers (Node) |
| `test/hook/lib.task-timer.test.ts` | new | Hook-lib unit tests |
| `hook/_lib.ps1` | mod | Append PowerShell marker helpers |
| `package.json` | mod | Register `claudeNotifier.minTaskDurationThreshold` setting |
| `src/settings/sync.ts` | mod | Include threshold in synced hook config JSON |
| `test/unit/settings.sync.threshold.test.ts` | new | Test threshold propagates to config |
| `hook/claude-notifier-on-prompt.js` | mod | Call `recordTaskStart` |
| `hook/claude-notifier-on-prompt.ps1` | mod | Call `Save-NotifierTaskStart` |
| `test/hook/on-prompt.threshold.test.ts` | new | Prompt hook writes marker |
| `hook/claude-notifier-on-stop.js` | mod | Threshold gate around fallback sound + popup |
| `hook/claude-notifier-on-stop.ps1` | mod | PowerShell threshold gate |
| `test/hook/on-stop.threshold.test.ts` | new | Stop fallback suppression |
| `hook/claude-notifier-on-permission.js` | mod | Threshold gate |
| `hook/claude-notifier-on-permission.ps1` | mod | PowerShell threshold gate |
| `test/hook/on-permission.threshold.test.ts` | new | Permission suppression |
| `hook/claude-notifier-on-question.js` | mod | Threshold gate |
| `hook/claude-notifier-on-question.ps1` | mod | PowerShell threshold gate |
| `test/hook/on-question.threshold.test.ts` | new | Question suppression |
| `src/signals/dispatch.ts` | mod | Threshold gate "done" sound (local + remote) |
| `test/unit/signals.dispatch.threshold.test.ts` | new | Done-signal suppression matrix |
| `src/signals/stage.ts` | mod | Delete marker on idle reset |
| `test/unit/signals.stage.threshold.test.ts` | new | Idle reset clears marker |
| `src/extension.ts` | mod | Sweep stale markers on activate |
| `src/hooks/lifecycle.ts` | mod | `teardownHooks` removes marker dir |

### Phase 2 — Per-event preview + preset swap (Layer 3)

| File | New / Mod | Responsibility |
|------|-----------|----------------|
| `src/ui/sound-picker.ts` | new | `pickEventSound` (QuickPick with preview-on-highlight) + `previewEventSound` + `pickEventThenAction` helper |
| `test/unit/ui.sound-picker.test.ts` | new | Pure logic tests for the picker (preset listing per platform, item construction) |
| `package.json` | mod | Register new commands & palette titles |
| `src/extension.ts` | mod | Register the new commands |

### Phase 3 — Status-bar control panel (Layer 1)

| File | New / Mod | Responsibility |
|------|-----------|----------------|
| `src/ui/panel-markdown.ts` | new | Pure builder: `buildPanelMarkdown(state) → MarkdownString` |
| `test/unit/ui.panel-markdown.test.ts` | new | Snapshot-style tests for each panel state |
| `src/ui/status-bar.ts` | mod | Replace simple tooltip with rich panel; rebuild on config change |
| `package.json` | mod | Register `setVolume`, `setThreshold`, `openSettings` commands |
| `src/extension.ts` | mod | Register the new commands |

### Phase 4 — Release

| File | New / Mod | Responsibility |
|------|-----------|----------------|
| `package.json` | mod | Version bump to 3.3.0 |
| `CHANGELOG.md` | mod | v3.3.0 entry |
| `README.md` | mod | Document threshold + panel + new commands |

---

## Pre-flight

- [ ] **Step 0.1: Confirm clean working tree and dependencies installed**

Run:
```bash
cd /Users/ashmit/projects/claude-notifier
git status
npm install
npm run typecheck
npm test
```
Expected: clean status, typecheck passes, tests pass.

- [ ] **Step 0.2: Create the feature branch**

Run:
```bash
git checkout -b feat/sound-control-surface
```

---

## Phase 1 — Threshold (Layer 2)

### Task 1: Add `TASK_START_DIR` to paths

**Files:**
- Modify: `src/paths.ts`

- [ ] **Step 1.1: Add the constant**

Open `src/paths.ts` and add after the `MUTE_FLAG` line:

```typescript
export const TASK_START_DIR = path.join(HOOKS_DIR, "claude-notifier-task-start");
```

- [ ] **Step 1.2: Typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 1.3: Commit**

```bash
git add src/paths.ts
git commit -m "feat(paths): add TASK_START_DIR for per-session task-start markers"
```

---

### Task 2: Extension-side task-timer helpers — write failing tests

**Files:**
- Create: `test/unit/signals.task-timer.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `test/unit/signals.task-timer.test.ts`:

```typescript
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
      const { recordTaskStart, shouldSuppressForThreshold } = await loadModule();
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
```

- [ ] **Step 2.2: Verify the tests fail (module doesn't exist yet)**

Run: `npx vitest run test/unit/signals.task-timer.test.ts`
Expected: FAIL — Cannot find module '../../src/signals/task-timer'.

---

### Task 3: Implement extension-side task-timer

**Files:**
- Create: `src/signals/task-timer.ts`

- [ ] **Step 3.1: Write the implementation**

Create `src/signals/task-timer.ts`:

```typescript
import * as fs from "fs";
import * as path from "path";
import { TASK_START_DIR } from "../paths";

const ANON_SESSION = "__anon__";

function safeSessionId(sessionId: string | null | undefined): string {
  if (!sessionId) return ANON_SESSION;
  // Strip anything that could escape the directory or break filename rules.
  const cleaned = sessionId.replace(/[^A-Za-z0-9._-]/g, "");
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
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    } catch {}
  }
}
```

- [ ] **Step 3.2: Run the tests**

Run: `npx vitest run test/unit/signals.task-timer.test.ts`
Expected: PASS (all 13 cases).

- [ ] **Step 3.3: Commit**

```bash
git add src/signals/task-timer.ts test/unit/signals.task-timer.test.ts
git commit -m "feat(signals): add per-session task-start marker helpers"
```

---

### Task 4: Hook-side task-timer helpers — write failing tests

**Files:**
- Create: `test/hook/lib.task-timer.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `test/hook/lib.task-timer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HOOK_LIB_DIR = path.join(__dirname, "..", "..", "hook", "_lib");

let tmpRoot: string;
let tmpHooksDir: string;
let tmpTaskDir: string;
let originalHome: string | undefined;
let originalProfile: string | undefined;

async function loadHookLib() {
  vi.resetModules();
  // hook/_lib/task-timer.js is CommonJS; load through require.
  delete require.cache[require.resolve(path.join(HOOK_LIB_DIR, "task-timer.js"))];
  delete require.cache[require.resolve(path.join(HOOK_LIB_DIR, "paths.js"))];
  return require(path.join(HOOK_LIB_DIR, "task-timer.js"));
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hook-task-timer-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  originalHome = process.env.HOME;
  originalProfile = process.env.USERPROFILE;
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalProfile;
});

describe("hook _lib/task-timer.js", () => {
  it("recordTaskStart writes per-session marker", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    const file = path.join(tmpTaskDir, "sess-1.json");
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(data.sessionId).toBe("sess-1");
    expect(typeof data.startedAt).toBe("number");
  });

  it("recordTaskStart uses __anon__ for missing session", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart(undefined);
    expect(fs.existsSync(path.join(tmpTaskDir, "__anon__.json"))).toBe(true);
  });

  it("shouldSuppressForThreshold returns false when marker missing", async () => {
    const lib = await loadHookLib();
    expect(lib.shouldSuppressForThreshold("nope", 10)).toBe(false);
  });

  it("shouldSuppressForThreshold returns false when threshold is 0", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    expect(lib.shouldSuppressForThreshold("sess-1", 0)).toBe(false);
  });

  it("shouldSuppressForThreshold suppresses for fresh marker", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("sess-1");
    expect(lib.shouldSuppressForThreshold("sess-1", 10)).toBe(true);
  });

  it("shouldSuppressForThreshold plays through when elapsed exceeds threshold", async () => {
    const lib = await loadHookLib();
    fs.mkdirSync(tmpTaskDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpTaskDir, "sess-1.json"),
      JSON.stringify({ startedAt: Date.now() - 20_000, sessionId: "sess-1" })
    );
    expect(lib.shouldSuppressForThreshold("sess-1", 10)).toBe(false);
  });

  it("shouldSuppressForThreshold falls open on corrupt marker", async () => {
    const lib = await loadHookLib();
    fs.mkdirSync(tmpTaskDir, { recursive: true });
    fs.writeFileSync(path.join(tmpTaskDir, "sess-broken.json"), "not json");
    expect(lib.shouldSuppressForThreshold("sess-broken", 10)).toBe(false);
  });

  it("sanitizes session ids", async () => {
    const lib = await loadHookLib();
    lib.recordTaskStart("../escape");
    const written = fs.readdirSync(tmpTaskDir);
    for (const f of written) {
      expect(f).not.toContain("..");
      expect(f).not.toContain("/");
      expect(f).not.toContain(path.sep);
    }
  });
});
```

- [ ] **Step 4.2: Verify the tests fail**

Run: `npx vitest run test/hook/lib.task-timer.test.ts`
Expected: FAIL — Cannot find module '.../task-timer.js'.

---

### Task 5: Implement hook-side task-timer

**Files:**
- Create: `hook/_lib/task-timer.js`

- [ ] **Step 5.1: Write the implementation**

Create `hook/_lib/task-timer.js`:

```javascript
const fs = require("fs");
const path = require("path");
const { TASK_START_DIR } = require("./paths");

const ANON_SESSION = "__anon__";

function safeSessionId(sessionId) {
  if (!sessionId) return ANON_SESSION;
  const cleaned = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned.length > 0 ? cleaned : ANON_SESSION;
}

function markerPath(sessionId) {
  return path.join(TASK_START_DIR, `${safeSessionId(sessionId)}.json`);
}

function recordTaskStart(sessionId) {
  try {
    fs.mkdirSync(TASK_START_DIR, { recursive: true });
    fs.writeFileSync(
      markerPath(sessionId),
      JSON.stringify({ startedAt: Date.now(), sessionId: safeSessionId(sessionId) })
    );
  } catch {}
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

module.exports = { recordTaskStart, getStartTime, shouldSuppressForThreshold };
```

- [ ] **Step 5.2: Add `TASK_START_DIR` to `hook/_lib/paths.js`**

Open `hook/_lib/paths.js` and add `TASK_START_DIR` to the exports. First read the current contents:

```bash
cat hook/_lib/paths.js
```

Locate the `module.exports` block (path constants). Add:

```javascript
const TASK_START_DIR = path.join(HOOKS_DIR, "claude-notifier-task-start");
```

and add `TASK_START_DIR` to the `module.exports = { ... }` object.

- [ ] **Step 5.3: Run the tests**

Run: `npx vitest run test/hook/lib.task-timer.test.ts`
Expected: PASS (8 cases).

- [ ] **Step 5.4: Commit**

```bash
git add hook/_lib/task-timer.js hook/_lib/paths.js test/hook/lib.task-timer.test.ts
git commit -m "feat(hook): add per-session task-start marker helpers"
```

---

### Task 6: Add PowerShell parity in `_lib.ps1`

**Files:**
- Modify: `hook/_lib.ps1`

- [ ] **Step 6.1: Append the PowerShell helpers**

Open `hook/_lib.ps1` and append the following after the existing `$LibActiveDir` declaration block. Find the line:

```powershell
$LibActiveDir  = Join-Path $LibHooksDir 'claude-notifier-active.d'
```

And add directly after it:

```powershell
$LibTaskStartDir = Join-Path $LibHooksDir 'claude-notifier-task-start'
```

Then append these functions at the end of the file (after `Test-ExtensionOwnsCwd`):

```powershell
function Get-NotifierSafeSessionId([string]$SessionId) {
    if (-not $SessionId) { return '__anon__' }
    $cleaned = ($SessionId -replace '[^A-Za-z0-9._-]', '')
    if (-not $cleaned) { return '__anon__' }
    return $cleaned
}

function Get-NotifierMarkerPath([string]$SessionId) {
    $sid = Get-NotifierSafeSessionId $SessionId
    return Join-Path $LibTaskStartDir ($sid + '.json')
}

function Save-NotifierTaskStart([string]$SessionId) {
    try {
        if (-not (Test-Path $LibTaskStartDir)) {
            New-Item -ItemType Directory -Path $LibTaskStartDir -Force | Out-Null
        }
        $sid = Get-NotifierSafeSessionId $SessionId
        $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        $payload = @{ startedAt = $now; sessionId = $sid } | ConvertTo-Json -Compress
        Set-Content -Path (Get-NotifierMarkerPath $SessionId) -Value $payload -NoNewline
    } catch {}
}

function Get-NotifierTaskStartedAt([string]$SessionId) {
    try {
        $raw = Get-Content (Get-NotifierMarkerPath $SessionId) -Raw -ErrorAction Stop
        $obj = $raw | ConvertFrom-Json
        if ($obj.startedAt -is [int64] -or $obj.startedAt -is [int] -or $obj.startedAt -is [double]) {
            return [int64]$obj.startedAt
        }
        return $null
    } catch { return $null }
}

function Test-NotifierThresholdSuppress([string]$SessionId, $ThresholdSec) {
    try {
        $t = [double]$ThresholdSec
    } catch { return $false }
    if ($t -le 0) { return $false }
    $started = Get-NotifierTaskStartedAt $SessionId
    if (-not $started) { return $false } # Fail open.
    $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    return (($now - $started) -lt ($t * 1000))
}
```

- [ ] **Step 6.2: Typecheck (no PowerShell tests; verify the JS suite still passes)**

Run: `npm run typecheck && npx vitest run test/hook test/unit`
Expected: PASS.

- [ ] **Step 6.3: Commit**

```bash
git add hook/_lib.ps1
git commit -m "feat(hook): add PowerShell marker helpers for task-timer parity"
```

---

### Task 7: Register `minTaskDurationThreshold` setting

**Files:**
- Modify: `package.json`

- [ ] **Step 7.1: Add the setting**

Open `package.json`. Inside `contributes.configuration.properties`, after `claudeNotifier.soundVolume`, add:

```json
"claudeNotifier.minTaskDurationThreshold": {
  "type": "number",
  "default": 0,
  "minimum": 0,
  "maximum": 3600,
  "description": "Suppress notification sounds and popups for tasks that complete in less than this many seconds. Counted from when you submit the prompt. 0 disables the feature (all notifications fire normally)."
}
```

- [ ] **Step 7.2: Verify package.json parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8'))"`
Expected: no output (success).

- [ ] **Step 7.3: Commit**

```bash
git add package.json
git commit -m "feat(settings): add minTaskDurationThreshold configuration"
```

---

### Task 8: Sync threshold into hook config JSON — write failing test

**Files:**
- Create: `test/unit/settings.sync.threshold.test.ts`

- [ ] **Step 8.1: Write the failing test**

Read `test/unit/hooks.cmd.test.ts` first to confirm how the existing tests mock `vscode`:

```bash
head -40 test/unit/hooks.cmd.test.ts
```

Then create `test/unit/settings.sync.threshold.test.ts` (mirroring the existing mock pattern — if the project uses `vi.mock("vscode", ...)` elsewhere, replicate it):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let configFile: string;

vi.mock("vscode", () => {
  const cfg: Record<string, unknown> = {
    "taskCompleted.level": "sound+popup",
    "taskCompleted.sound": "Hero",
    "needsPermission.level": "sound+popup",
    "needsPermission.sound": "Glass",
    "asksQuestion.level": "sound+popup",
    "asksQuestion.sound": "Funk",
    soundVolume: 1,
    minTaskDurationThreshold: 15,
  };
  return {
    workspace: {
      getConfiguration: () => ({
        get: (key: string, fallback: unknown) => (key in cfg ? cfg[key] : fallback),
      }),
    },
  };
});

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-threshold-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("syncConfig — threshold propagation", () => {
  it("writes minTaskDurationThreshold to the hook config JSON", async () => {
    vi.resetModules();
    const { syncConfig } = await import("../../src/settings/sync");
    syncConfig();
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    expect(cfg.minTaskDurationThreshold).toBe(15);
  });
});
```

- [ ] **Step 8.2: Verify the test fails**

Run: `npx vitest run test/unit/settings.sync.threshold.test.ts`
Expected: FAIL — `cfg.minTaskDurationThreshold` is undefined.

---

### Task 9: Implement threshold sync

**Files:**
- Modify: `src/settings/sync.ts`

- [ ] **Step 9.1: Wire threshold into the synced config**

Open `src/settings/sync.ts`. In `syncConfig()`, locate:

```typescript
const config = {
  ...events,
  soundVolume: clampVolume(cfg.get<number>("soundVolume", DEFAULT_VOLUME)),
};
```

Change to:

```typescript
const config = {
  ...events,
  soundVolume: clampVolume(cfg.get<number>("soundVolume", DEFAULT_VOLUME)),
  minTaskDurationThreshold: clampThreshold(cfg.get<number>("minTaskDurationThreshold", 0)),
};
```

And add the helper above `syncConfig`:

```typescript
export function clampThreshold(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v) || v < 0) return 0;
  if (v > 3600) return 3600;
  return v;
}

export function getMinTaskDurationThreshold(): number {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return clampThreshold(config.minTaskDurationThreshold ?? 0);
  } catch {
    return 0;
  }
}
```

- [ ] **Step 9.2: Run the test**

Run: `npx vitest run test/unit/settings.sync.threshold.test.ts`
Expected: PASS.

- [ ] **Step 9.3: Run the full unit suite to confirm no regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 9.4: Commit**

```bash
git add src/settings/sync.ts test/unit/settings.sync.threshold.test.ts
git commit -m "feat(settings): propagate minTaskDurationThreshold into hook config"
```

---

### Task 10: Prompt hook records task start — write failing test

**Files:**
- Create: `test/hook/on-prompt.threshold.test.ts`

- [ ] **Step 10.1: Write the failing test**

Create `test/hook/on-prompt.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-prompt");

describe("hook: claude-notifier-on-prompt — task-start marker", () => {
  let home: ReturnType<typeof tmpHome>;
  let taskDir: string;

  beforeEach(() => {
    home = tmpHome();
    taskDir = path.join(home.hooksDir, "claude-notifier-task-start");
  });
  afterEach(() => home.dispose());

  it("writes per-session marker with startedAt", () => {
    const res = runHook(SCRIPT, { session_id: "sess-1" }, home.root);
    expect(res.status).toBe(0);
    const file = path.join(taskDir, "sess-1.json");
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(data.sessionId).toBe("sess-1");
    expect(typeof data.startedAt).toBe("number");
  });

  it("uses __anon__ when session_id missing", () => {
    const res = runHook(SCRIPT, {}, home.root);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(taskDir, "__anon__.json"))).toBe(true);
  });
});
```

- [ ] **Step 10.2: Verify the test fails**

Run: `npx vitest run test/hook/on-prompt.threshold.test.ts`
Expected: FAIL — marker file not present.

---

### Task 11: Implement prompt-hook marker write

**Files:**
- Modify: `hook/claude-notifier-on-prompt.js`
- Modify: `hook/claude-notifier-on-prompt.ps1`

- [ ] **Step 11.1: Update the JS hook**

Replace the entire contents of `hook/claude-notifier-on-prompt.js`:

```javascript
#!/usr/bin/env node
// Claude Notifier — UserPromptSubmit hook
// Signals the extension to advance the per-session stage when the user
// submits a new prompt, and records the prompt-submit timestamp into a
// per-session marker file so threshold-aware sound paths can suppress
// short-task notifications. No sound, no notification — coordination only.
const { writeSignal } = require("./_lib/signal");
const { recordTaskStart } = require("./_lib/task-timer");

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  writeSignal("prompt", input.session_id);
  recordTaskStart(input.session_id);
  process.exit(0);
});
```

- [ ] **Step 11.2: Update the PowerShell hook**

Replace the entire contents of `hook/claude-notifier-on-prompt.ps1`:

```powershell
# Claude Notifier - UserPromptSubmit hook (PowerShell)
# Signals the extension and records prompt-submit timestamp for the
# minTaskDurationThreshold feature.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

Write-NotifierSignal -Reason 'prompt' -SessionId $data.session_id
Save-NotifierTaskStart -SessionId $data.session_id

exit 0
```

- [ ] **Step 11.3: Run the test**

Run: `npx vitest run test/hook/on-prompt.threshold.test.ts`
Expected: PASS.

- [ ] **Step 11.4: Run all hook tests to confirm no regressions**

Run: `npm run test:hook`
Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add hook/claude-notifier-on-prompt.js hook/claude-notifier-on-prompt.ps1 test/hook/on-prompt.threshold.test.ts
git commit -m "feat(hook): prompt hook records per-session task-start marker"
```

---

### Task 12: Stop-hook threshold gate — write failing test

**Files:**
- Create: `test/hook/on-stop.threshold.test.ts`

- [ ] **Step 12.1: Write the failing test**

Create `test/hook/on-stop.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-stop");

describe("hook: on-stop — minTaskDurationThreshold", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
    // No active extension marker -> fallback sound path is reachable.
  });
  afterEach(() => home.dispose());

  function writeConfig(threshold: number) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        taskCompleted: { level: "sound+popup", sound: "Hero" },
        soundVolume: 1,
        minTaskDurationThreshold: threshold,
      })
    );
  }

  function writeMarker(sid: string, ageMs: number) {
    const dir = path.join(home.hooksDir, "claude-notifier-task-start");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sid}.json`),
      JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
    );
  }

  it("suppresses fallback sound when elapsed < threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 2_000); // 2s elapsed
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    // Signal is still written (the extension's dispatch is the canonical decision
    // point); the hook only suppresses its own fallback sound + popup.
    expect(readSignal(home.signalFile)).toMatch(/^done /);
    // The hook should have short-circuited before the sound spawn → fast exit.
    expect(res.durationMs).toBeLessThan(500);
  });

  it("plays fallback sound when elapsed >= threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });

  it("plays fallback sound when threshold is 0", () => {
    writeConfig(0);
    writeMarker("sess-1", 2_000);
    const res = runHook(SCRIPT, { session_id: "sess-1", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });

  it("plays fallback sound when marker missing (fail open)", () => {
    writeConfig(10);
    // no marker written
    const res = runHook(SCRIPT, { session_id: "sess-missing", cwd: "/x" }, home.root);
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^done /);
  });
});
```

- [ ] **Step 12.2: Verify failure**

Run: `npx vitest run test/hook/on-stop.threshold.test.ts`
Expected: At least the "suppresses" test fails — the existing hook plays the sound regardless of threshold.

---

### Task 13: Implement stop-hook threshold gate

**Files:**
- Modify: `hook/claude-notifier-on-stop.js`
- Modify: `hook/claude-notifier-on-stop.ps1`

- [ ] **Step 13.1: Update JS hook**

In `hook/claude-notifier-on-stop.js`, add the import near the top:

```javascript
const { shouldSuppressForThreshold } = require("./_lib/task-timer");
```

Then find the block that begins:

```javascript
if (extensionOwnsCwd(cwd)) process.exit(0);

const config = readConfig();
const cfg = config?.taskCompleted ?? {};
const level = cfg.level ?? "sound+popup";
const volume = config?.soundVolume ?? 1;

if (level === "off") process.exit(0);
```

Right after `if (level === "off") process.exit(0);`, add:

```javascript
const threshold = config?.minTaskDurationThreshold ?? 0;
if (shouldSuppressForThreshold(input.session_id, threshold)) process.exit(0);
```

- [ ] **Step 13.2: Update PowerShell hook**

In `hook/claude-notifier-on-stop.ps1`, after:

```powershell
if ($level -eq 'off') { exit 0 }
```

Add:

```powershell
$threshold = if ((Read-NotifierConfig).minTaskDurationThreshold) { (Read-NotifierConfig).minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) { exit 0 }
```

- [ ] **Step 13.3: Run the test**

Run: `npx vitest run test/hook/on-stop.threshold.test.ts`
Expected: PASS.

- [ ] **Step 13.4: Run all hook tests for regressions**

Run: `npm run test:hook`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add hook/claude-notifier-on-stop.js hook/claude-notifier-on-stop.ps1 test/hook/on-stop.threshold.test.ts
git commit -m "feat(hook): on-stop respects minTaskDurationThreshold for fallback sound"
```

---

### Task 14: Permission-hook threshold gate — test + implementation

**Files:**
- Create: `test/hook/on-permission.threshold.test.ts`
- Modify: `hook/claude-notifier-on-permission.js`
- Modify: `hook/claude-notifier-on-permission.ps1`

- [ ] **Step 14.1: Write failing test**

Create `test/hook/on-permission.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-permission");

describe("hook: on-permission — minTaskDurationThreshold", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
  });
  afterEach(() => home.dispose());

  function writeConfig(threshold: number) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        needsPermission: { level: "sound+popup", sound: "Glass" },
        soundVolume: 1,
        minTaskDurationThreshold: threshold,
      })
    );
  }

  function writeMarker(sid: string, ageMs: number) {
    const dir = path.join(home.hooksDir, "claude-notifier-task-start");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sid}.json`),
      JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
    );
  }

  it("suppresses sound + popup when elapsed < threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 1_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    // Signal must still be written (extension may want to know).
    expect(readSignal(home.signalFile)).toMatch(/^input /);
    expect(res.durationMs).toBeLessThan(500);
  });

  it("fires when elapsed >= threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input /);
  });

  it("fires when threshold is 0", () => {
    writeConfig(0);
    writeMarker("sess-1", 1_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "Bash" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^input /);
  });
});
```

- [ ] **Step 14.2: Verify failure**

Run: `npx vitest run test/hook/on-permission.threshold.test.ts`
Expected: at least the first test fails.

- [ ] **Step 14.3: Update JS hook**

In `hook/claude-notifier-on-permission.js`, add to the imports:

```javascript
const { shouldSuppressForThreshold } = require("./_lib/task-timer");
```

After:

```javascript
if (level === "off") process.exit(0);
```

Add:

```javascript
const threshold = config?.minTaskDurationThreshold ?? 0;
if (shouldSuppressForThreshold(input.session_id, threshold)) {
  // Still write the signal so the extension can react (it has its own
  // threshold check for the "done" branch; here we only suppress local sound
  // and popup).
  writeSignal("input", input.session_id);
  process.exit(0);
}
```

- [ ] **Step 14.4: Update PowerShell hook**

In `hook/claude-notifier-on-permission.ps1`, after the `'off' { exit 0 }` (or equivalent early-exit for the off level), add the threshold check before the sound branch. First read the current file to find the correct insertion point:

```bash
cat hook/claude-notifier-on-permission.ps1
```

Locate `if ($level -eq 'off') { exit 0 }` (or the equivalent), and after it add:

```powershell
$threshold = if ((Read-NotifierConfig).minTaskDurationThreshold) { (Read-NotifierConfig).minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) {
    Write-NotifierSignal -Reason 'input' -SessionId $data.session_id
    exit 0
}
```

- [ ] **Step 14.5: Run all hook tests**

Run: `npm run test:hook`
Expected: PASS.

- [ ] **Step 14.6: Commit**

```bash
git add hook/claude-notifier-on-permission.js hook/claude-notifier-on-permission.ps1 test/hook/on-permission.threshold.test.ts
git commit -m "feat(hook): on-permission respects minTaskDurationThreshold"
```

---

### Task 15: Question-hook threshold gate — test + implementation

**Files:**
- Create: `test/hook/on-question.threshold.test.ts`
- Modify: `hook/claude-notifier-on-question.js`
- Modify: `hook/claude-notifier-on-question.ps1`

- [ ] **Step 15.1: Write failing test**

Create `test/hook/on-question.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpHome, runHook, readSignal, hookScript } from "./_helpers";

const SCRIPT = hookScript("claude-notifier-on-question");

describe("hook: on-question — minTaskDurationThreshold", () => {
  let home: ReturnType<typeof tmpHome>;

  beforeEach(() => {
    home = tmpHome();
  });
  afterEach(() => home.dispose());

  function writeConfig(threshold: number) {
    fs.writeFileSync(
      home.configFile,
      JSON.stringify({
        asksQuestion: { level: "sound+popup", sound: "Funk" },
        soundVolume: 1,
        minTaskDurationThreshold: threshold,
      })
    );
  }

  function writeMarker(sid: string, ageMs: number) {
    const dir = path.join(home.hooksDir, "claude-notifier-task-start");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sid}.json`),
      JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
    );
  }

  it("suppresses sound + popup when elapsed < threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 1_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "AskUserQuestion" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question /);
    expect(res.durationMs).toBeLessThan(500);
  });

  it("fires when elapsed >= threshold", () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    const res = runHook(
      SCRIPT,
      { session_id: "sess-1", tool_name: "AskUserQuestion" },
      home.root
    );
    expect(res.status).toBe(0);
    expect(readSignal(home.signalFile)).toMatch(/^question /);
  });
});
```

- [ ] **Step 15.2: Verify failure**

Run: `npx vitest run test/hook/on-question.threshold.test.ts`
Expected: FAIL on the suppression case.

- [ ] **Step 15.3: Update JS hook**

In `hook/claude-notifier-on-question.js`, add to imports:

```javascript
const { shouldSuppressForThreshold } = require("./_lib/task-timer");
```

After:

```javascript
if (level === "off") process.exit(0);
```

Add:

```javascript
const threshold = config?.minTaskDurationThreshold ?? 0;
if (shouldSuppressForThreshold(input.session_id, threshold)) {
  writeSignal("question", input.session_id);
  process.exit(0);
}
```

- [ ] **Step 15.4: Update PowerShell hook**

In `hook/claude-notifier-on-question.ps1`, after `if ($level -eq 'off') { exit 0 }`, add:

```powershell
$threshold = if ((Read-NotifierConfig).minTaskDurationThreshold) { (Read-NotifierConfig).minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) {
    Write-NotifierSignal -Reason 'question' -SessionId $data.session_id
    exit 0
}
```

- [ ] **Step 15.5: Run all hook tests**

Run: `npm run test:hook`
Expected: PASS.

- [ ] **Step 15.6: Commit**

```bash
git add hook/claude-notifier-on-question.js hook/claude-notifier-on-question.ps1 test/hook/on-question.threshold.test.ts
git commit -m "feat(hook): on-question respects minTaskDurationThreshold"
```

---

### Task 16: Dispatch "done" threshold gate — write failing test

**Files:**
- Create: `test/unit/signals.dispatch.threshold.test.ts`

- [ ] **Step 16.1: Inspect existing dispatch tests for mock patterns**

Run: `ls test/unit | grep -i dispatch`
If a dispatch test file already exists, read it to match the existing mock style. Otherwise we create the first one.

- [ ] **Step 16.2: Write the failing test**

Create `test/unit/signals.dispatch.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let tmpTaskDir: string;
let signalFile: string;
let configFile: string;
let playLocalCalls: number;
let playRemoteCalls: number;
let popupCalls: number;

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/x" } }],
    onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
    getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
  },
  window: {
    showInformationMessage: (..._args: unknown[]) => {
      popupCalls++;
      return Promise.resolve(undefined);
    },
  },
  env: { remoteName: undefined },
}));

vi.mock("../../src/notifications/sound", () => ({
  playLocalSound: () => {
    playLocalCalls++;
  },
}));

vi.mock("../../src/notifications/remote", () => ({
  playRemoteSound: () => {
    playRemoteCalls++;
  },
}));

vi.mock("../../src/notifications/local", () => ({
  showLocalNotification: () => {},
}));

vi.mock("../../src/routing/cwd", () => ({
  getOwnWorkspaceFolders: () => ["/x"],
  cwdMatchesFolder: (a: string, b: string) => a.startsWith(b),
}));

vi.mock("../../src/routing/focus", () => ({
  rememberDone: () => {},
  getRememberedDone: () => undefined,
  revealClaudeTab: () => Promise.resolve(),
  startFocusSignalWatcher: () => ({ dispose() {} }),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-threshold-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  signalFile = path.join(tmpHooksDir, "claude-signal");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  playLocalCalls = 0;
  playRemoteCalls = 0;
  popupCalls = 0;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

function writeConfig(threshold: number) {
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      taskCompleted: { level: "sound+popup", sound: "Hero" },
      soundVolume: 1,
      minTaskDurationThreshold: threshold,
    })
  );
}

function writeMarker(sid: string, ageMs: number) {
  fs.mkdirSync(tmpTaskDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpTaskDir, `${sid}.json`),
    JSON.stringify({ startedAt: Date.now() - ageMs, sessionId: sid })
  );
}

describe("dispatch — done signal threshold gate", () => {
  it("suppresses local sound + popup when elapsed < threshold", async () => {
    writeConfig(10);
    writeMarker("sess-1", 1_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    // shouldFire is in-memory; first call returns true. We invoke the
    // exported handler indirectly by re-importing and triggering the watcher.
    // Easier: drive handleSignal via direct file-watch contract.
    // For this test we directly invoke via a thin export shim added below.
    // (See impl note: we add an exported `__handleSignalForTest` thin wrapper.)
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(0);
    expect(popupCalls).toBe(0);
  });

  it("fires local sound + popup when elapsed >= threshold", async () => {
    writeConfig(10);
    writeMarker("sess-1", 20_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
    expect(popupCalls).toBe(1);
  });

  it("fires when threshold is 0", async () => {
    writeConfig(0);
    writeMarker("sess-1", 1_000);
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-1 /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
  });

  it("falls open when marker missing", async () => {
    writeConfig(10);
    // no marker
    vi.resetModules();
    const dispatch = await import("../../src/signals/dispatch");
    fs.writeFileSync(signalFile, `done ${Date.now()} sess-missing /x`);
    (dispatch as unknown as { __handleSignalForTest: () => void }).__handleSignalForTest();
    expect(playLocalCalls).toBe(1);
  });
});
```

- [ ] **Step 16.3: Verify failure**

Run: `npx vitest run test/unit/signals.dispatch.threshold.test.ts`
Expected: FAIL — `__handleSignalForTest` not exported AND threshold logic absent.

---

### Task 17: Implement dispatch threshold gate

**Files:**
- Modify: `src/signals/dispatch.ts`

- [ ] **Step 17.1: Add threshold gate + test export**

Open `src/signals/dispatch.ts`. Add to the imports:

```typescript
import { shouldSuppressForThreshold } from "./task-timer";
import { getMinTaskDurationThreshold } from "../settings/sync";
```

Locate `function showNotification(reason: string, cwd: string): void` and modify it. Wrap the entire "done" branch so the gate runs before any sound or popup:

Replace the existing `} else if (reason === "done") {` block with:

```typescript
} else if (reason === "done") {
  const level = getEventLevel("taskCompleted");
  const sessionIdForGate = lastDoneSessionId; // captured by handleSignal
  const threshold = getMinTaskDurationThreshold();
  const suppress = shouldSuppressForThreshold(sessionIdForGate, threshold);
  if (suppress) return;
  if (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND) {
    if (isRemote) {
      playRemoteSound();
    } else {
      const cfg = getEventConfig("taskCompleted");
      playLocalSound(
        cfg.sound,
        "/System/Library/Sounds/Hero.aiff",
        "C:\\Windows\\Media\\tada.wav",
        getSoundVolume()
      );
    }
  }
  if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
    vscode.window
      .showInformationMessage("Claude has finished the task.", "Reveal")
      .then((pick) => {
        if (pick === "Reveal") {
          void revealClaudeTab(getRememberedDone(cwd));
        }
      });
    if (!isRemote) {
      showLocalNotification("Claude has finished the task.", cwd);
    }
  }
}
```

Add module-level state for the session id forwarded to `showNotification`:

```typescript
let lastDoneSessionId: string | null = null;
```

In `handleSignal`, where it currently has `if (reason === "done" && cwd) { rememberDone(...) }`, set `lastDoneSessionId = sessionId` right before the `showNotification(reason, cwd);` call:

```typescript
if (reason === "done" || reason === "input" || reason === "question") {
  if (!stage.shouldFire(sessionId, reason)) {
    return;
  }
  lastDoneSessionId = sessionId;
  showNotification(reason, cwd);
}
```

At the bottom of the file, add the test-only export:

```typescript
// Internal: directly drive the signal handler from tests. Not part of the
// public surface — the production caller is the fs.watch callback above.
export function __handleSignalForTest(): void {
  handleSignal();
}
```

- [ ] **Step 17.2: Run dispatch tests**

Run: `npx vitest run test/unit/signals.dispatch.threshold.test.ts`
Expected: PASS.

- [ ] **Step 17.3: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 17.4: Commit**

```bash
git add src/signals/dispatch.ts test/unit/signals.dispatch.threshold.test.ts
git commit -m "feat(dispatch): gate done sound+popup on minTaskDurationThreshold"
```

---

### Task 18: Idle-reset clears marker — test + implementation

**Files:**
- Create: `test/unit/signals.stage.threshold.test.ts`
- Modify: `src/signals/stage.ts`

- [ ] **Step 18.1: Write failing test**

Create `test/unit/signals.stage.threshold.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const IDLE_MS = 30 * 60 * 1000;
let tmpRoot: string;
let tmpTaskDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stage-threshold-test-"));
  const tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  tmpTaskDir = path.join(tmpHooksDir, "claude-notifier-task-start");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  vi.resetModules();
});

describe("stage idle-reset deletes session marker", () => {
  it("deletes the session marker when idle timer fires", async () => {
    const stage = await import("../../src/signals/stage");
    const timer = await import("../../src/signals/task-timer");
    timer.recordTaskStart("sess-1");
    expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(true);

    // Touch the stage so the idle timer is armed.
    stage.shouldFire("sess-1", "done");

    // Advance past the 30-min idle window.
    vi.advanceTimersByTime(IDLE_MS + 1);

    expect(fs.existsSync(path.join(tmpTaskDir, "sess-1.json"))).toBe(false);
  });
});
```

- [ ] **Step 18.2: Verify failure**

Run: `npx vitest run test/unit/signals.stage.threshold.test.ts`
Expected: FAIL — marker still exists.

- [ ] **Step 18.3: Wire marker delete into idle timer**

Open `src/signals/stage.ts`. Add at the top of the file:

```typescript
import { deleteMarker } from "./task-timer";
```

In `armIdleTimer`, inside the `setTimeout` callback, add `deleteMarker(sid);` right after the `s.fired.clear();` line:

```typescript
s.idleTimer = setTimeout(() => {
  log(
    `[stage] session ${sid} advanced ${s.stageId}→${s.stageId + 1} (idle ${IDLE_RESET_MS / 60000}m)`
  );
  s.stageId += 1;
  s.fired.clear();
  deleteMarker(sid);
  s.idleTimer = null;
}, IDLE_RESET_MS);
```

- [ ] **Step 18.4: Run the test**

Run: `npx vitest run test/unit/signals.stage.threshold.test.ts`
Expected: PASS.

- [ ] **Step 18.5: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 18.6: Commit**

```bash
git add src/signals/stage.ts test/unit/signals.stage.threshold.test.ts
git commit -m "feat(stage): delete session marker on idle reset"
```

---

### Task 19: Activate-time cleanup + uninstall teardown

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/hooks/lifecycle.ts`

- [ ] **Step 19.1: Add cleanup call on activate**

Open `src/extension.ts`. Import:

```typescript
import { cleanupStaleMarkers } from "./signals/task-timer";
```

After `syncConfig();` in `activate`, add:

```typescript
cleanupStaleMarkers(24 * 60 * 60 * 1000); // 24h
```

- [ ] **Step 19.2: Add marker dir removal to teardown**

Open `src/hooks/lifecycle.ts`. Import:

```typescript
import { TASK_START_DIR } from "../paths";
```

In `teardownHooks()`, after the existing `_lib/` cleanup, add:

```typescript
try {
  fs.rmSync(TASK_START_DIR, { recursive: true, force: true });
} catch {}
```

- [ ] **Step 19.3: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 19.4: Commit**

```bash
git add src/extension.ts src/hooks/lifecycle.ts
git commit -m "feat(lifecycle): sweep stale task-start markers on activate; clear on uninstall"
```

---

### Task 20: Phase 1 wrap — full regression run

- [ ] **Step 20.1: Run everything**

```bash
npm run lint
npm run typecheck
npm test
```
Expected: all green.

- [ ] **Step 20.2: Manually verify the marker flow end-to-end on a sample hook input**

```bash
TMPHOME=$(mktemp -d)
mkdir -p "$TMPHOME/.claude/hooks"
HOME="$TMPHOME" node hook/claude-notifier-on-prompt.js <<< '{"session_id":"manual-1"}'
ls "$TMPHOME/.claude/hooks/claude-notifier-task-start/"
cat "$TMPHOME/.claude/hooks/claude-notifier-task-start/manual-1.json"
rm -rf "$TMPHOME"
```
Expected: `manual-1.json` exists with `startedAt` and `sessionId`.

---

## Phase 2 — Per-event preview + preset swap (Layer 3)

### Task 21: Sound-picker module — test + implementation

**Files:**
- Create: `test/unit/ui.sound-picker.test.ts`
- Create: `src/ui/sound-picker.ts`

- [ ] **Step 21.1: Write failing test**

Create `test/unit/ui.sound-picker.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/notifications/sound", () => ({
  MACOS_SOUNDS: { Hero: "/x/Hero.aiff", Glass: "/x/Glass.aiff" },
  WIN_SOUNDS: { tada: "/x/tada.wav", ding: "/x/ding.wav" },
  LINUX_SOUNDS: { Hero: "/x/hero.oga", Glass: "/x/glass.oga" },
  playLocalSound: vi.fn(),
}));

import { listPresetsForPlatform, EVENT_KEYS } from "../../src/ui/sound-picker";

describe("sound-picker — preset listings", () => {
  it("returns macOS presets on darwin", () => {
    expect(listPresetsForPlatform("darwin")).toEqual(["Hero", "Glass"]);
  });

  it("returns Windows presets on win32", () => {
    expect(listPresetsForPlatform("win32")).toEqual(["tada", "ding"]);
  });

  it("returns Linux presets on linux", () => {
    expect(listPresetsForPlatform("linux")).toEqual(["Hero", "Glass"]);
  });

  it("exports the canonical event keys", () => {
    expect(EVENT_KEYS).toEqual(["taskCompleted", "needsPermission", "asksQuestion"]);
  });
});
```

- [ ] **Step 21.2: Verify failure**

Run: `npx vitest run test/unit/ui.sound-picker.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 21.3: Implement the module**

Create `src/ui/sound-picker.ts`:

```typescript
import * as vscode from "vscode";
import { MACOS_SOUNDS, WIN_SOUNDS, LINUX_SOUNDS, playLocalSound } from "../notifications/sound";
import { getEventConfig, getSoundVolume } from "../settings/sync";

export const EVENT_KEYS = ["taskCompleted", "needsPermission", "asksQuestion"] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

const EVENT_LABELS: Record<EventKey, string> = {
  taskCompleted: "Task completed",
  needsPermission: "Permission",
  asksQuestion: "Question",
};

const DEFAULT_MAC: Record<EventKey, string> = {
  taskCompleted: "/System/Library/Sounds/Hero.aiff",
  needsPermission: "/System/Library/Sounds/Glass.aiff",
  asksQuestion: "/System/Library/Sounds/Funk.aiff",
};

const DEFAULT_WIN: Record<EventKey, string> = {
  taskCompleted: "C:\\Windows\\Media\\tada.wav",
  needsPermission: "C:\\Windows\\Media\\Windows Notify.wav",
  asksQuestion: "C:\\Windows\\Media\\Windows Notify.wav",
};

export function listPresetsForPlatform(platform: NodeJS.Platform): string[] {
  if (platform === "win32") return Object.keys(WIN_SOUNDS);
  if (platform === "linux") return Object.keys(LINUX_SOUNDS);
  return Object.keys(MACOS_SOUNDS);
}

function isEventKey(value: unknown): value is EventKey {
  return typeof value === "string" && (EVENT_KEYS as readonly string[]).includes(value);
}

async function pickEventKey(prompt: string): Promise<EventKey | undefined> {
  const pick = await vscode.window.showQuickPick(
    EVENT_KEYS.map((k) => ({ label: EVENT_LABELS[k], description: k, key: k })),
    { title: prompt, placeHolder: "Which event?" }
  );
  return pick?.key;
}

export function previewEventSound(eventKey: EventKey): void {
  const cfg = getEventConfig(eventKey);
  const volume = getSoundVolume();
  playLocalSound(cfg.sound, DEFAULT_MAC[eventKey], DEFAULT_WIN[eventKey], volume);
}

export async function previewEventSoundCommand(arg?: unknown): Promise<void> {
  const key = isEventKey(arg) ? arg : await pickEventKey("Preview Sound");
  if (!key) return;
  previewEventSound(key);
}

export async function pickEventSoundCommand(arg?: unknown): Promise<void> {
  const key = isEventKey(arg) ? arg : await pickEventKey("Choose Sound");
  if (!key) return;

  const presets = listPresetsForPlatform(process.platform);
  const current = getEventConfig(key).sound;
  const volume = getSoundVolume();

  const items = presets.map((name) => ({
    label: name,
    description: name === current ? "(current)" : undefined,
    name,
  }));

  const qp = vscode.window.createQuickPick<(typeof items)[number]>();
  qp.title = `Choose sound for ${EVENT_LABELS[key]}`;
  qp.placeholder = "Arrow keys preview each sound; Enter to confirm";
  qp.items = items;
  qp.activeItems = items.filter((i) => i.name === current);

  qp.onDidChangeActive((active) => {
    const item = active[0];
    if (!item) return;
    playLocalSound(item.name, DEFAULT_MAC[key], DEFAULT_WIN[key], volume);
  });

  const picked = await new Promise<string | undefined>((resolve) => {
    qp.onDidAccept(() => {
      const item = qp.selectedItems[0];
      resolve(item?.name);
      qp.hide();
    });
    qp.onDidHide(() => resolve(undefined));
    qp.show();
  });

  if (picked && picked !== current) {
    await vscode.workspace
      .getConfiguration("claudeNotifier")
      .update(`${key}.sound`, picked, vscode.ConfigurationTarget.Global);
  }
}
```

- [ ] **Step 21.4: Run the test**

Run: `npx vitest run test/unit/ui.sound-picker.test.ts`
Expected: PASS.

- [ ] **Step 21.5: Commit**

```bash
git add src/ui/sound-picker.ts test/unit/ui.sound-picker.test.ts
git commit -m "feat(ui): add sound picker with preview-on-highlight + per-event preview command"
```

---

### Task 22: Register preview + picker commands

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`

- [ ] **Step 22.1: Add commands to manifest**

In `package.json`, inside `contributes.commands`, after the existing entries, add:

```json
{ "command": "claudeNotifier.previewEventSound", "title": "Claude Notifier: Preview Sound…" },
{ "command": "claudeNotifier.pickEventSound", "title": "Claude Notifier: Choose Sound…" }
```

- [ ] **Step 22.2: Register the commands**

In `src/extension.ts`, add to imports:

```typescript
import { previewEventSoundCommand, pickEventSoundCommand } from "./ui/sound-picker";
```

Inside `context.subscriptions.push(...)`, add:

```typescript
vscode.commands.registerCommand("claudeNotifier.previewEventSound", previewEventSoundCommand),
vscode.commands.registerCommand("claudeNotifier.pickEventSound", pickEventSoundCommand),
```

- [ ] **Step 22.3: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 22.4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat(extension): register sound preview and picker commands"
```

---

## Phase 3 — Status-bar control panel (Layer 1)

### Task 23: Panel markdown builder — failing test

**Files:**
- Create: `test/unit/ui.panel-markdown.test.ts`

- [ ] **Step 23.1: Write failing test**

Create `test/unit/ui.panel-markdown.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  MarkdownString: class {
    value = "";
    isTrusted = false;
    supportHtml = false;
    supportThemeIcons = false;
    appendMarkdown(s: string) {
      this.value += s;
      return this;
    }
  },
}));

import { buildPanelMarkdown, PanelState } from "../../src/ui/panel-markdown";

const baseState: PanelState = {
  muted: false,
  volume: 1,
  threshold: 0,
  events: [
    { key: "taskCompleted", label: "Task completed", sound: "Hero" },
    { key: "needsPermission", label: "Permission", sound: "Glass" },
    { key: "asksQuestion", label: "Question", sound: "Funk" },
  ],
};

describe("buildPanelMarkdown", () => {
  it("sets isTrusted, supportHtml, supportThemeIcons", () => {
    const md = buildPanelMarkdown(baseState);
    expect(md.isTrusted).toBe(true);
    expect(md.supportHtml).toBe(true);
    expect(md.supportThemeIcons).toBe(true);
  });

  it("includes a setVolume command link for each preset", () => {
    const md = buildPanelMarkdown(baseState).value;
    for (const v of [0, 0.25, 0.5, 0.75, 1, 1.5, 2]) {
      expect(md).toContain(`command:claudeNotifier.setVolume?${encodeURIComponent(JSON.stringify([v]))}`);
    }
  });

  it("marks the current volume preset with a check icon", () => {
    const md = buildPanelMarkdown({ ...baseState, volume: 1 }).value;
    expect(md).toMatch(/\$\(check\)[^\n]*100%/);
  });

  it("shows muted state when muted=true", () => {
    const md = buildPanelMarkdown({ ...baseState, muted: true }).value;
    expect(md).toContain("$(mute)");
    expect(md).toContain("Sound OFF");
  });

  it("shows current threshold value", () => {
    const md = buildPanelMarkdown({ ...baseState, threshold: 15 }).value;
    expect(md).toContain("15s");
  });

  it("shows '(off)' when threshold is 0", () => {
    const md = buildPanelMarkdown({ ...baseState, threshold: 0 }).value;
    expect(md).toMatch(/Min task duration[^\n]*off/i);
  });

  it("renders a row per event with preview + change links", () => {
    const md = buildPanelMarkdown(baseState).value;
    for (const ev of baseState.events) {
      expect(md).toContain(ev.label);
      expect(md).toContain(ev.sound);
      expect(md).toContain(
        `command:claudeNotifier.previewEventSound?${encodeURIComponent(JSON.stringify([ev.key]))}`
      );
      expect(md).toContain(
        `command:claudeNotifier.pickEventSound?${encodeURIComponent(JSON.stringify([ev.key]))}`
      );
    }
  });

  it("includes the toggleSound and openSettings commands", () => {
    const md = buildPanelMarkdown(baseState).value;
    expect(md).toContain("command:claudeNotifier.toggleSound");
    expect(md).toContain("command:claudeNotifier.openSettings");
  });

  it("includes the setThreshold command", () => {
    const md = buildPanelMarkdown(baseState).value;
    expect(md).toContain("command:claudeNotifier.setThreshold");
  });
});
```

- [ ] **Step 23.2: Verify failure**

Run: `npx vitest run test/unit/ui.panel-markdown.test.ts`
Expected: FAIL — module missing.

---

### Task 24: Implement panel-markdown builder

**Files:**
- Create: `src/ui/panel-markdown.ts`

- [ ] **Step 24.1: Implementation**

Create `src/ui/panel-markdown.ts`:

```typescript
import * as vscode from "vscode";

export interface PanelEvent {
  key: "taskCompleted" | "needsPermission" | "asksQuestion";
  label: string;
  sound: string;
}

export interface PanelState {
  muted: boolean;
  volume: number; // 0..2
  threshold: number; // seconds; 0 = off
  events: PanelEvent[];
}

const VOLUME_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;

function commandUri(command: string, args?: unknown[]): string {
  if (!args || args.length === 0) return `command:${command}`;
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

function volumeBar(value: number): string {
  if (value === 0) return "○○○○○○○○";
  if (value <= 0.25) return "●●○○○○○○";
  if (value <= 0.5) return "●●●●○○○○";
  if (value <= 0.75) return "●●●●●●○○";
  if (value <= 1) return "●●●●●●●●";
  if (value <= 1.5) return "●●●●●●●●+";
  return "●●●●●●●●++";
}

function volumeLabel(value: number): string {
  if (value === 0) return "0% (mute)";
  return `${Math.round(value * 100)}%`;
}

function currentPreset(volume: number): number {
  // Snap to nearest preset for marking the "current" row.
  let best = VOLUME_PRESETS[0];
  let bestDist = Infinity;
  for (const p of VOLUME_PRESETS) {
    const d = Math.abs(p - volume);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function buildPanelMarkdown(state: PanelState): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;

  const headerIcon = state.muted ? "$(mute)" : "$(unmute)";
  const headerLabel = state.muted ? "Sound OFF" : "Sound ON";
  md.appendMarkdown(`${headerIcon} **Claude Notifier — ${headerLabel}**\n\n`);
  md.appendMarkdown(`---\n\n`);

  // Volume rows
  md.appendMarkdown(`**Volume**\n\n`);
  const cur = currentPreset(state.volume);
  for (const v of VOLUME_PRESETS) {
    const marker = v === cur ? "$(check) " : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    const link = commandUri("claudeNotifier.setVolume", [v]);
    md.appendMarkdown(
      `${marker}[${volumeBar(v)} ${volumeLabel(v)}](${link})\n\n`
    );
  }

  // Mute toggle
  const muteLabel = state.muted ? "Unmute" : "Mute";
  md.appendMarkdown(
    `[${state.muted ? "$(unmute)" : "$(mute)"} ${muteLabel}](${commandUri("claudeNotifier.toggleSound")})\n\n`
  );

  // Threshold
  const thresholdText = state.threshold > 0 ? `${state.threshold}s` : "off";
  md.appendMarkdown(
    `**Min task duration:** ${thresholdText} &nbsp; [Change…](${commandUri("claudeNotifier.setThreshold")})\n\n`
  );

  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`**Events**\n\n`);
  for (const ev of state.events) {
    const previewLink = commandUri("claudeNotifier.previewEventSound", [ev.key]);
    const pickLink = commandUri("claudeNotifier.pickEventSound", [ev.key]);
    md.appendMarkdown(
      `- **${ev.label}** — ${ev.sound} &nbsp; [$(play) Preview](${previewLink}) &nbsp; [$(chevron-right) Change](${pickLink})\n`
    );
  }
  md.appendMarkdown(`\n`);

  // Settings
  md.appendMarkdown(`[$(gear) Open settings](${commandUri("claudeNotifier.openSettings")})\n`);

  return md;
}
```

- [ ] **Step 24.2: Run the test**

Run: `npx vitest run test/unit/ui.panel-markdown.test.ts`
Expected: PASS.

- [ ] **Step 24.3: Commit**

```bash
git add src/ui/panel-markdown.ts test/unit/ui.panel-markdown.test.ts
git commit -m "feat(ui): add MarkdownString panel builder for status-bar control surface"
```

---

### Task 25: Wire panel into status bar + new commands

**Files:**
- Modify: `src/ui/status-bar.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 25.1: Rewrite status-bar to use the panel**

Replace the contents of `src/ui/status-bar.ts`:

```typescript
import * as fs from "fs";
import * as vscode from "vscode";
import { MUTE_FLAG } from "../paths";
import { buildPanelMarkdown, PanelEvent } from "./panel-markdown";

let statusBarItem: vscode.StatusBarItem;
let soundEnabled = true;
let context: vscode.ExtensionContext;

const EVENT_DEFS: Array<{ key: PanelEvent["key"]; label: string }> = [
  { key: "taskCompleted", label: "Task completed" },
  { key: "needsPermission", label: "Permission" },
  { key: "asksQuestion", label: "Question" },
];

export function createStatusBar(ctx: vscode.ExtensionContext): void {
  context = ctx;
  soundEnabled = !fs.existsSync(MUTE_FLAG);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  // No command on click — the panel opens on hover. Mute toggle is a link
  // inside the panel.
  refresh();
  statusBarItem.show();
  ctx.subscriptions.push(statusBarItem);

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claudeNotifier")) refresh();
    })
  );
}

export function toggleSound(): void {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    try {
      fs.unlinkSync(MUTE_FLAG);
    } catch {}
  } else {
    fs.writeFileSync(MUTE_FLAG, "");
  }
  refresh();
}

export async function setVolume(volume: number): Promise<void> {
  await vscode.workspace
    .getConfiguration("claudeNotifier")
    .update("soundVolume", volume, vscode.ConfigurationTarget.Global);
}

export async function setThreshold(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const current = cfg.get<number>("minTaskDurationThreshold", 0);
  const input = await vscode.window.showInputBox({
    title: "Minimum task duration threshold",
    prompt: "Suppress notifications for tasks shorter than this many seconds. 0 to disable.",
    value: String(current),
    validateInput: (v) => {
      if (v.trim() === "") return "Enter a number of seconds (0 to disable).";
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 3600) return "Must be between 0 and 3600.";
      return null;
    },
  });
  if (input === undefined) return;
  await cfg.update("minTaskDurationThreshold", Number(input), vscode.ConfigurationTarget.Global);
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "@ext:singularityinc.claude-notifier"
  );
}

function refresh(): void {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const events: PanelEvent[] = EVENT_DEFS.map(({ key, label }) => ({
    key,
    label,
    sound: cfg.get<string>(`${key}.sound`, ""),
  }));
  statusBarItem.text = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = buildPanelMarkdown({
    muted: !soundEnabled,
    volume: cfg.get<number>("soundVolume", 1),
    threshold: cfg.get<number>("minTaskDurationThreshold", 0),
    events,
  });
}
```

- [ ] **Step 25.2: Add commands to manifest**

In `package.json`, inside `contributes.commands`, append:

```json
{ "command": "claudeNotifier.setVolume", "title": "Claude Notifier: Set Volume" },
{ "command": "claudeNotifier.setThreshold", "title": "Claude Notifier: Set Threshold" },
{ "command": "claudeNotifier.openSettings", "title": "Claude Notifier: Open Settings" }
```

- [ ] **Step 25.3: Register the new commands**

In `src/extension.ts`, update the imports from `./ui/status-bar`:

```typescript
import { createStatusBar, toggleSound, setVolume, setThreshold, openSettings } from "./ui/status-bar";
```

Inside `context.subscriptions.push(...)`, append:

```typescript
vscode.commands.registerCommand("claudeNotifier.setVolume", (v: number) => setVolume(v)),
vscode.commands.registerCommand("claudeNotifier.setThreshold", () => setThreshold()),
vscode.commands.registerCommand("claudeNotifier.openSettings", () => openSettings()),
```

- [ ] **Step 25.4: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 25.5: Commit**

```bash
git add src/ui/status-bar.ts src/extension.ts package.json
git commit -m "feat(ui): wire MarkdownString panel into status bar and register new commands"
```

---

### Task 26: Manual smoke pass

- [ ] **Step 26.1: Compile and package**

```bash
npm run compile
npm run package
```
Expected: VSIX in the project root.

- [ ] **Step 26.2: Sideload the VSIX (manual)**

Install the produced `.vsix` in VS Code via the Extensions panel ("Install from VSIX…"). Reload window.

- [ ] **Step 26.3: Manual checklist**

Per the spec's "Manual smoke" section, walk through:
- Threshold=10, short prompt → no sound ✓
- Threshold=10, long prompt → sound ✓
- Two terminals, two sessions, independent gating ✓
- Threshold=0 → all sounds as v3.2.0 ✓
- Hover status bar → panel renders with current values
- Click volume rows, mute, change threshold, preview each event, change each event sound
- Permission prompt mid-task with threshold=10 → no sound
- Disable extension; trigger hooks-only Stop in terminal → fallback respects threshold

Mark any anomalies as bugs and address before moving to release.

---

## Phase 4 — Release

### Task 27: Version bump + changelog

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 27.1: Bump version**

In `package.json`, change `"version": "3.2.0"` to `"version": "3.3.0"`.

- [ ] **Step 27.2: Update CHANGELOG**

Prepend to `CHANGELOG.md`:

```markdown
## 3.3.0

### Added
- **Status bar control panel**: hover the Claude icon for a Copilot-style anchored panel with volume presets, mute toggle, threshold control, and per-event sound preview/change.
- **`claudeNotifier.minTaskDurationThreshold`** (seconds, default `0`): suppress notification sounds and popups for tasks shorter than this. Timer starts at prompt submission. Per-session marker files in `~/.claude/hooks/claude-notifier-task-start/` handle parallel Claude sessions across terminals and VS Code windows independently.
- **`Claude Notifier: Choose Sound…`** and **`Claude Notifier: Preview Sound…`** commands.
- Sound picker now previews each option on highlight (arrow through to audition).

### Changed
- Clicking the status bar item no longer toggles mute — mute is now a link inside the hover panel. Click on the item is a no-op.

### Internal
- New `src/signals/task-timer.ts` and `hook/_lib/task-timer.js` helpers; PowerShell parity in `hook/_lib.ps1`.
- Done-signal sound/popup in `src/signals/dispatch.ts` now passes through the threshold gate.
- Stage idle-reset (30 min) also deletes stale per-session markers.
- Extension activate sweeps markers older than 24 h; uninstall removes the marker dir.
```

- [ ] **Step 27.3: Verify package.json parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8'))"`
Expected: no output.

- [ ] **Step 27.4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): 3.3.0"
```

---

### Task 28: README docs

**Files:**
- Modify: `README.md`

- [ ] **Step 28.1: Document the new behaviors**

Open `README.md`. Locate the section that documents the status bar (search for `status bar` or `mute`) and update it to describe the hover panel.

Add a section near the existing settings table describing the new setting:

```markdown
### Minimum task duration threshold

`claudeNotifier.minTaskDurationThreshold` (seconds, default `0`)

When > 0, notification sounds and popups are suppressed for any task that completes in less than this many seconds. Counted from the moment you submit the prompt. Set to `0` to disable (the default).

Useful when you're actively watching the IDE and don't need audio for sub-second roundtrips — set it to e.g. `10` to only get audio for longer-running work.
```

Add a section about the status-bar panel:

```markdown
### Status-bar control panel

Hover the **Claude** entry in the status bar to open the control panel. From there you can:

- Set volume to 0/25/50/75/100/150/200%.
- Mute and unmute.
- Set the minimum task duration threshold.
- Preview each event's current sound (Task completed / Permission / Question).
- Change each event's sound preset with arrow-key audition (preview-on-highlight).
- Open the full settings page.

The panel is anchored above the status bar and is sticky — move into it to click. Clicking the status bar item itself does nothing; mute is a link inside the panel.
```

- [ ] **Step 28.2: Commit**

```bash
git add README.md
git commit -m "docs: document v3.3.0 panel and minTaskDurationThreshold"
```

---

### Task 29: Final verification

- [ ] **Step 29.1: Full quality gate**

```bash
npm run lint
npm run typecheck
npm test
npm run compile
npm run package
```
Expected: all green; VSIX produced.

- [ ] **Step 29.2: Verify install/uninstall flow**

Install the new VSIX in a clean VS Code profile. Confirm hooks are installed, then uninstall and confirm marker dir is removed:

```bash
ls ~/.claude/hooks/claude-notifier-task-start/ 2>&1
```
Expected after uninstall: `No such file or directory`.

- [ ] **Step 29.3: Push branch and open PR (do not merge)**

```bash
git push -u origin feat/sound-control-surface
gh pr create --title "feat: sound control surface (panel + minTaskDurationThreshold)" --body "$(cat <<'EOF'
## Summary

Closes #1. Ships v3.3.0 with three coupled additions:

1. **Status-bar control panel** — anchored hover panel with volume / mute / threshold / per-event preview & sound preset swap.
2. **`claudeNotifier.minTaskDurationThreshold`** — suppress notifications for short tasks, timer anchored at prompt submission. Per-session marker files keep parallel Claude sessions independent.
3. **Sound picker with preview-on-highlight** — arrow through preset list to audition.

Design and rationale: see `docs/superpowers/specs/2026-05-24-sound-control-surface-design.md`.
Implementation plan: see `docs/superpowers/plans/2026-05-24-sound-control-surface.md`.

## Test plan

- [x] Unit + hook tests green (`npm test`).
- [x] Manual smoke walkthrough per spec (panel hover, threshold cases, parallel sessions, install/uninstall).
- [x] Sideloaded VSIX verified end-to-end.
EOF
)"
```

- [ ] **Step 29.4: Manual review of the open PR**

Walk through the diff in the GitHub UI. Confirm no spurious changes. Wait for user merge.

---

## Self-review notes

**Spec coverage**

- Layer 1 (panel): Tasks 23–25 build, test, and wire the MarkdownString panel; Task 25 also adds the `setVolume`, `setThreshold`, `openSettings` commands. ✅
- Layer 2 (threshold): Tasks 1–20 cover paths, helpers, hook gates, dispatch gate, idle/activate/uninstall hygiene. All six paths from the spec covered (two dispatch branches are unified via the single done-branch gate; the spec's "remote" branch shares the gated entry). ✅
- Layer 3 (preview + preset swap): Tasks 21–22 deliver the picker module and command registration. ✅
- Parallelism: per-session marker files implemented in Tasks 3, 5, 6; tests in Tasks 2, 4, 12, 14, 15 assert session isolation. ✅
- Fail-open semantics: Tasks 2 step 2.1 ("falls open when marker file is unreadable JSON" / "returns false when marker missing"), and equivalent hook tests in Task 4 and Task 12. ✅
- Marker hygiene (overwrite/idle/activate/uninstall): Tasks 11, 18, 19. ✅
- Setting name `claudeNotifier.minTaskDurationThreshold`: Task 7. ✅
- Sound picker preview-on-highlight + command palette entries: Tasks 21–22. ✅
- Volume scale stays 0–2: Task 24 (`VOLUME_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2]`). ✅
- v3.3.0 + CHANGELOG + README: Tasks 27, 28. ✅

**Placeholder scan**

No "TBD", "add error handling later", "similar to Task N" placeholders. Every code-touching step shows the actual code or the exact edit. The only judgement calls deferred to the engineer:
- Task 8 Step 8.1 instructs reading `test/unit/hooks.cmd.test.ts` first to mirror the project's existing `vi.mock("vscode", ...)` pattern; this is required because we don't know the project's mock convention by reading the spec alone. Acceptable.
- Task 14 Step 14.4 instructs reading `claude-notifier-on-permission.ps1` first to find the correct insertion point. Same justification.

**Type / signature consistency**

- `recordTaskStart(sessionId)` signature consistent across `src/signals/task-timer.ts` and `hook/_lib/task-timer.js` (Tasks 3, 5). ✅
- `shouldSuppressForThreshold(sessionId, thresholdSec)` same across both sides. ✅
- `PanelState.events[]` and `EventKey` types match between `panel-markdown.ts` (Task 24) and `sound-picker.ts` (Task 21). ✅
- Command names consistent across `package.json`, `extension.ts`, `panel-markdown.ts`. ✅
- `getMinTaskDurationThreshold()` helper defined in Task 9 and consumed in Task 17. ✅

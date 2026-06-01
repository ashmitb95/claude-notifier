# Sound Control Surface — Design

**Target release:** v3.3.0
**Replaces / closes:** #1 (open), supersedes closed PR #2
**Status:** Draft for review

## Summary

Replace the status-bar click-to-mute interaction with a richer Copilot-style anchored panel that exposes volume, mute, a new minimum-task-duration threshold, per-event sound preview, and per-event preset swap. Add a single threshold setting that suppresses sound + popup for tasks shorter than N seconds, gated consistently across every sound-emission path in the codebase. Ship all three layers in one release.

## Goals

- Centralize sound controls onto one anchored surface so users don't have to round-trip through the Settings UI for common adjustments.
- Resurrect issue #1's threshold ask with a cleaner mechanism than the closed PR #2 — true task-start timing (UserPromptSubmit) and full coverage of the v3.x sound-emission paths.
- Preserve every current behavior when the threshold is `0` (the default).
- Handle parallel Claude sessions (multiple terminals in one window, multiple windows on one machine, sub-agents) correctly.

## Non-goals

- Per-event thresholds.
- Per-event mute toggles (the existing `level=off` setting already silences a single event).
- A "minimum-time-between-sounds" rate limit (that's `stage.ts`'s job).
- A real DOM slider — would require a webview, which can't anchor to the status bar.
- Click-to-open behavior for the anchored panel (no public VS Code API supports it).

## Layer 1 — Status-bar control panel

### Mechanism

`vscode.MarkdownString` with `isTrusted = true`, `supportHtml = true`, `supportThemeIcons = true`, assigned to the existing `StatusBarItem.tooltip`. Anchored above the status bar item; opens on hover; sticky (mouse can move into it to click links). Click on the status bar item itself is a no-op.

### Rationale

- **Anchored + rich** without proposed APIs. Copilot uses `vscode.proposed.chatStatusItem.d.ts` + `workbench.action.chat.openCopilotStatus`, both Microsoft-only. A `MarkdownString` tooltip with `supportHtml` is the closest public-API equivalent.
- **No click-to-open** is the one trade-off: VS Code exposes no public API to programmatically open a status bar tooltip. We accept hover-trigger; modern VS Code makes the popup sticky enough for click interactions.

### Panel layout (rendered top-to-bottom)

```
$(unmute) Claude Notifier — Sound ON
──────────────────────────────────────
Volume
       ○○○○○○○○   0% (mute)
       ●●○○○○○○  25%
       ●●●●○○○○  50%
       ●●●●●●○○  75%
 $(check) ●●●●●●●● 100%   ← current
       ●●●●●●●●+ 150%
       ●●●●●●●●++ 200%

Mute    [Mute / Unmute]

Min task duration   10s   [Change…]

──────────────────────────────────────
Events
  Task completed   Hero    $(play) Preview   $(chevron-right) Change
  Permission       Glass   $(play) Preview   $(chevron-right) Change
  Question         Funk    $(play) Preview   $(chevron-right) Change

$(gear) Open settings
```

### Commands

Each interactive row is a command link in the markdown.

| Command id | Args | Action |
|---|---|---|
| `claudeNotifier.toggleSound` | — | (existing) toggle the mute flag file |
| `claudeNotifier.setVolume` | `number 0..2` | `workspace.getConfiguration("claudeNotifier").update("soundVolume", v, Global)` |
| `claudeNotifier.setThreshold` | — | `window.showInputBox` for seconds; updates `minTaskDurationThreshold` |
| `claudeNotifier.previewEventSound` | `eventKey` (`taskCompleted` / `needsPermission` / `asksQuestion`) | Reads current sound + volume, calls `playLocalSound`. Ignores mute and threshold (deliberate preview). |
| `claudeNotifier.pickEventSound` | `eventKey` | Opens QuickPick of platform-appropriate presets; updates `${eventKey}.sound` |
| `claudeNotifier.openSettings` | — | `workbench.action.openSettings @ext:singularityinc.claude-notifier` |

### Module structure

- `src/ui/panel-markdown.ts` (new) — pure function `buildPanelMarkdown(state: PanelState): MarkdownString`. `state` derived from `vscode.workspace.getConfiguration("claudeNotifier")` plus the mute flag. Pure → unit-testable.
- `src/ui/status-bar.ts` — extend to: build the markdown on activate, rebuild on `onDidChangeConfiguration("claudeNotifier")` and on mute-flag changes, expose the new commands.
- `src/extension.ts` — register the four new commands and pipe their args through.

### Rebuild triggers

- `onDidChangeConfiguration("claudeNotifier")` → rebuild.
- After `toggleSound` → rebuild.
- After `setVolume` / `setThreshold` / `pickEventSound` → the config-change listener picks it up automatically.

### Look-and-feel notes

- The volume "bar" is rendered via Unicode `●` / `○` (8-dot bar for the 0–100% range; `+` glyphs for 150%/200% boost). Exact glyph choice is implementation detail. Each row is a command link wrapping the bar and the label. The currently active preset gets a `$(check)` prefix and is rendered bold (or not a link — we don't link the active value).
- `supportHtml = true` lets us use `<table>` for tidy column alignment on the Events section and `<hr>` for dividers. HTML is sanitized by VS Code — no script tags, no event handlers; styling limited to allowed inline styles and theme color variables.

## Layer 2 — `minTaskDurationThreshold`

### Setting

```json
"claudeNotifier.minTaskDurationThreshold": {
  "type": "number",
  "default": 0,
  "minimum": 0,
  "maximum": 3600,
  "description": "Suppress notification sounds and popups for tasks that complete in less than this many seconds. Counted from when you submit the prompt. 0 disables the feature (all notifications fire normally)."
}
```

### Timer anchor

Counted from **UserPromptSubmit**. The `claude-notifier-on-prompt` hook is the earliest reliable signal that a new task has started — earlier and more general than PR #2's first-tool-use anchor (no text-only-response caveat).

### Marker storage

```
~/.claude/hooks/claude-notifier-task-start/
  <sessionId>.json
  <sessionId>.json
  __anon__.json
```

Each file contains `{ "startedAt": <ms epoch>, "sessionId": "<id>" }`. Per-session is required to handle parallelism (see Parallelism below).

### Sound-emission paths gated

All five live paths that emit sound today gain a threshold check:

1. `claude-notifier-on-stop.js/.ps1` — fallback sound path (when no extension owns the cwd).
2. `src/signals/dispatch.ts` — "done" sound, local playback branch.
3. `src/signals/dispatch.ts` — "done" sound, remote playback branch.
4. `claude-notifier-on-permission.js/.ps1`.
5. `claude-notifier-on-question.js/.ps1`.

`claude-notifier-on-notification.js` exists in the source tree but is **not in the hook registry** ([src/hooks/registry.ts](src/hooks/registry.ts)) — it's legacy from a prior version, swept by `teardownHooks` ([src/hooks/lifecycle.ts:147](src/hooks/lifecycle.ts#L147)) but never installed by current versions. No threshold gate required.

### Suppression rule

`elapsed = now - startedAt`. If `0 < threshold` AND `elapsed < threshold * 1000` AND marker exists → suppress **both** sound and popup. Otherwise fire normally.

### Fail-open semantics

If the marker file is missing or unreadable, the threshold check returns "don't suppress" — the sound plays. Ensures notifications never silently break for users who upgrade and haven't yet submitted a prompt under the new hooks.

### Marker hygiene

- Overwrite on every UserPromptSubmit for the same `sessionId` → natural per-task reset.
- `stage.ts` idle-reset (30 min) → also `unlink` the session's marker.
- On extension activate → sweep markers older than 24 h.
- On uninstall → delete the whole `claude-notifier-task-start/` directory.

### Parallelism

| Scenario | Why it works |
|---|---|
| One VS Code window, multiple terminals running `claude` | Each has its own `session_id` → independent marker file. |
| Multiple VS Code windows, one `claude` in each | Each extension instance routes signals by `cwd` (existing behavior). Markers stay independent because they're keyed by `session_id`. |
| Multiple VS Code windows, multiple `claude` in each | Combination of the two above. |
| Sub-agents (Task tool) | Each sub-agent has its own `session_id` and timer. |
| Rapid-fire prompts (user submits B while A still running) | UserPromptSubmit overwrites the marker for that session. Late Stop from A computes against B → suppressed. Stage dedup already absorbs most of these; the residual is acceptable. |
| Anonymous session (no `session_id`) | Shared `__anon__.json`; matches existing `stage.ts` convention. |

### Module structure

- `src/signals/task-timer.ts` (new) — `recordTaskStart(sessionId)`, `getStartTime(sessionId)`, `shouldSuppressForThreshold(sessionId, thresholdSec)`, `cleanupStaleMarkers(maxAgeMs)`, `deleteMarker(sessionId)`.
- `hook/_lib/task-timer.js` (new) — same surface, file-backed, shared by all hook scripts.
- `hook/_lib.ps1` (modify) — `_lib.ps1` is a single file, not a directory. Add `Save-NotifierTaskStart`, `Get-NotifierTaskElapsed`, `Test-NotifierThresholdSuppress` functions inline.
- `claude-notifier-on-prompt.js` (+`.ps1`) — calls `recordTaskStart` after `writeSignal`.
- Each sound path wraps its existing playback block in `if (!shouldSuppressForThreshold(sid, threshold)) { play(); popup(); }`.
- `dispatch.ts` `showNotification` reads threshold from config (via `getSoundVolume`-style helper) and short-circuits inside each `if (level === ...)` branch for `done`.

### Cleanup integration points

- `stage.ts` idle handler → `deleteMarker(sid)`.
- `extension.ts` activate → `cleanupStaleMarkers(24 * 60 * 60 * 1000)`.
- `src/uninstall.ts` → `rm -rf` the marker dir.

## Layer 3 — Per-event sound preview + preset swap

### Preview

`previewEventSound(eventKey)` reads the configured sound preset and volume for that event and calls `playLocalSound` directly. Bypasses the mute flag and the threshold (a preview is the user's deliberate test, not a notification).

### Preset swap

`pickEventSound(eventKey)` opens a `vscode.window.showQuickPick` listing platform-appropriate presets (`MACOS_SOUNDS` keys on macOS, `WIN_SOUNDS` on Windows, `LINUX_SOUNDS` on Linux). **Preview-on-highlight**: wire `onDidChangeActive` to call `playLocalSound` on the focused item so users can audition by arrowing through. On confirm: `configuration.update(${eventKey}.sound, picked, Global)`. On dismiss without confirm: no-op.

The existing `syncConfig` listener re-writes the hook config JSON on the config-change event — no additional plumbing needed.

Also expose `claudeNotifier.pickEventSound` and `claudeNotifier.previewEventSound` in the command palette (`Claude Notifier: Choose Sound…`, `Claude Notifier: Preview Sound…`) so the features are discoverable outside the status-bar panel. Both commands prompt for an event in a first-step QuickPick when invoked without args.

## Testing

### Unit (vitest, `test/unit`)

- `panel-markdown.test.ts` — renders correct command links and icons for representative states (muted, threshold=0, threshold=10, volume=0.5).
- `task-timer.test.ts` — `recordTaskStart` writes the right file, `getElapsedMs` reads it back, fail-open when marker missing, parallel sessions read independently, `cleanupStaleMarkers` removes only old files.
- `dispatch.threshold.test.ts` — "done" signal suppression matrix (threshold=0, marker missing, elapsed<threshold, elapsed>threshold, remote, local).
- `stage.threshold.test.ts` — idle-reset deletes the session's marker.

### Hook (`test/hook`)

- Each of the three sound-playing hook scripts (stop fallback, permission, question) gains a threshold-suppression case alongside its existing assertions. Verifies the hook bails before calling `playSound` when elapsed < threshold. Plus the prompt hook gains an assertion that it writes the marker.

### Manual smoke

- Set threshold=10. Submit a short prompt (`echo hi`). Expect no sound.
- Set threshold=10. Submit a long prompt. Expect sound after ~10s.
- Open two terminals, two `claude` sessions. Make one short and one long. Each is independently gated.
- Set threshold=0. Verify all sounds fire as in v3.2.0.
- Open the panel. Click each volume row. Click Mute, Unmute. Click Change… for threshold. Click Preview for each event. Click Change for each event.
- Trigger a permission prompt 2s after a prompt with threshold=10. Expect no sound.
- Disable extension, send hooks-only notifications. Verify Stop fallback also respects threshold.

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Marker dir missing | Hook creates it on first write (`mkdir -p` convention from `_lib/signal.js`). |
| R2 | Partial-write read | Tiny payload; `writeFileSync` is atomic enough on all targets. Read failures fall open. |
| R3 | Windows path parity | All hook `.ps1` files get the same threshold gate; helpers added inline to `_lib.ps1` (single file). |
| R4 | Status bar tooltip rendering differences across themes | `supportThemeIcons` ensures icons recolor; HTML uses theme CSS variables; no fixed colors. |
| R5 | Tooltip too tall to fit on small screens | Keep markdown compact; the Events section is the only long part — collapsible via `<details>` if HTML sanitizer allows it (verify during impl; if not, accept the height). |
| R6 | Setting name churn | `claudeNotifier.minTaskDurationThreshold` chosen explicitly. PR #2's `durationThreshold` is not adopted; no migration shim (PR #2 never merged). |
| R7 | `supportHtml = true` security | Only configure on a tooltip we build; never inject user-controlled text. All dynamic values are typed numbers / known event keys. |

## Open questions for implementation

- Confirm whether `<details>` collapses are supported inside a `MarkdownString` tooltip in current VS Code. If not, accept a longer panel.
- Confirm whether VS Code Remote (SSH) resolves `~/.claude/hooks/` to the remote home for both the hook scripts (yes, by construction) and the extension's dispatch (yes — it runs on remote in remote mode).

## Versioning + release notes

- Bump `package.json` to `3.3.0`.
- `CHANGELOG.md` entry covering all three layers.
- `README.md` updates: new setting, new status-bar interaction, new commands.

## Deliberately out of scope

- Migrating PR #2's `durationThreshold` setting (it never shipped).
- Webview-based panel (would be the only path to a true draggable slider; not worth the weight).
- Per-event mute toggles in the panel.
- Sound import / custom sound files.
- Changing the volume scale from 0–2 to 0–100. We keep 0–2 because it matches `afplay -v`'s native scale and changing it would silently re-interpret every existing user's configured volume.

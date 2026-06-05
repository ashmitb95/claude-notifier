# Changelog

## [3.3.1] - 2026-06-05

### Fixed

- **`install.sh` no longer ships a broken install.** The installer copied a hardcoded list of `_lib` modules that had silently rotted — `pid.js`, `click.js`, `task-timer.js`, and `cmux.js` were all required by the hooks but missing from the list, so a fresh `curl | bash` install crashed every event hook (e.g. `Cannot find module './cmux'`). The list is now derived from the repo via the GitHub contents API, so it can't drift again as new modules are added. ([#50](https://github.com/ashmitb95/claude-notifier/issues/50))
- **`uninstall.sh` now removes the `UserPromptSubmit` hook.** `install.sh` registers a `UserPromptSubmit` hook but the uninstaller never removed it, leaving a dangling registration behind. ([#50](https://github.com/ashmitb95/claude-notifier/issues/50))

## [3.3.0] - 2026-05-24

### Added

- **Status-bar control panel.** Hovering the **Claude** entry in the status bar now opens an anchored, Copilot-style panel with: volume presets (0/25/50/75/100/150/200%), minimum-task-duration threshold control, and a per-event row for each notification (Task completed / Permission / Question) with `$(play) Preview` and `$(chevron-right) Change` links. The panel is built from a `MarkdownString` with `isTrusted` + `supportHtml` + `supportThemeIcons`; every interactive element is a registered VS Code command. **Click** on the status-bar item itself still toggles mute (v3.2.0 muscle memory); the panel is opened by hover.
- **`SubagentStop` hook** registered with Claude Code so a `Task` subagent finish can fire its own notification. New `claudeNotifier.subagentCompleted.{level,sound}` settings; `level` defaults to `off` so subagent completions are silent until the user opts in. Default sound preset is `Pop`.
- **`claudeNotifier.suppressSubagentInteractions`** (boolean, default `true`). When a permission or question hook fires from inside a `Task` subagent (detected via the `agent_id` field in the hook payload), the notifier silences its sound and OS popup. The main agent's own prompts still fire normally. Affects **only the notifier's audio + banner** — Claude Code's actual approve/deny dialog and question UI in the chat are untouched. Useful in auto-accept mode where subagent prompts are typically internal detail.
- **`claudeNotifier.minTaskDurationThreshold` setting** (seconds, default `0` = off, max `3600`). When `> 0`, notification sounds and popups are suppressed for tasks that complete in less than this many seconds. The timer starts at prompt submission (`UserPromptSubmit` hook). Per-session marker files in `~/.claude/hooks/claude-notifier-task-start/` keep parallel Claude sessions across terminals and VS Code windows independent. Suppression applies to all five sound-emission paths: Stop hook fallback, dispatch "done" (local + remote), Permission hook, and Question hook. Fail-open: if the marker is missing or unreadable, the sound plays. Closes [#1](https://github.com/ashmitb95/claude-notifier/issues/1).
- **`Claude Notifier: Choose Sound…`** command (`claudeNotifier.pickEventSound`) — opens a QuickPick of platform-appropriate presets with preview-on-highlight (arrow through to audition each sound at the configured volume).
- **`Claude Notifier: Preview Sound…`** command (`claudeNotifier.previewEventSound`) — plays the configured sound for a chosen event at the configured volume.
- **`Claude Notifier: Set Volume`**, **`Set Threshold`**, **`Open Settings`** commands — backing the panel's links, also exposed in the command palette.

### Changed

- The previous "Claude Notifier sound: ON/OFF" toast is removed; state is conveyed by the status-bar text and the panel header. Clicking the status-bar item still toggles mute (preserves v3.2.0 muscle memory and satisfies the VS Code constraint that a `command` must be assigned for the hover tooltip to fire — see [microsoft/vscode#75909](https://github.com/microsoft/vscode/issues/75909)). Hover over the item opens the rich panel for every other action.
- **Default behavior change for users with subagent-heavy sessions**: `claudeNotifier.suppressSubagentInteractions` defaults to `true`. Permission and question prompts originating inside a `Task` subagent no longer fire the notifier's sound + popup. Set to `false` to restore 3.2.0 behavior. The actual approve/deny dialogs in Claude Code's chat are unaffected.
- Stage idle-reset (30 min) now also deletes the session's task-start marker file.
- Extension activation sweeps task-start markers older than 24 h; uninstall removes the whole marker directory.

### Fixed

- Suppress duplicate sound/popup when running inside [cmux](https://github.com/manaflow-ai/cmux) (`com.cmuxterm.app`). cmux's wrapper injects its own `Stop` / `Notification` / `PermissionRequest` hooks; claude-notifier now detects this via the `CMUX_CLAUDE_HOOK_CMUX_BIN` env var the wrapper exports and skips its own sound + popup to avoid double-notifying. Signal coordination is unaffected. Contributed by [@takashito](https://github.com/takashito). ([#46](https://github.com/ashmitb95/claude-notifier/pull/46))

### Internal

- New `src/signals/task-timer.ts` and `hook/_lib/task-timer.js` provide `recordTaskStart`, `getStartTime`, `shouldSuppressForThreshold` (+ `deleteMarker` / `cleanupStaleMarkers` on the extension side). PowerShell parity in `hook/_lib.ps1`.
- New `src/ui/panel-markdown.ts` is a pure function that turns the panel state into a `MarkdownString` — no side effects, unit-tested.
- New `src/ui/sound-picker.ts` houses the QuickPick logic and the `previewEventSound` helper.
- `src/signals/dispatch.ts` now consults `getMinTaskDurationThreshold` before playing the "done" sound (local or remote) and before showing the popup.
- 19 new tests added (covering helper semantics, threshold suppression matrix on dispatch, idle-reset marker cleanup, panel markdown rendering, sound-picker preset listing, prompt-hook marker write, and per-hook signal-write invariants under suppression). Full suite: ~205 tests.

## [3.2.0] - 2026-05-23

### Added

- Configurable sound volume via a global `claudeNotifier.soundVolume` setting (0–2, default 1), honored by both the extension's `playLocalSound()` and the hook scripts' `playSound()`. Applied through `paplay --volume` on Linux and `afplay -v` on macOS; Windows plays at system volume (`Media.SoundPlayer` exposes no volume API). Contributed by [@collectifweb](https://github.com/collectifweb). ([#38](https://github.com/ashmitb95/claude-notifier/pull/38))

## [3.1.0] - 2026-05-23

### Added

- Click-to-focus the originating Claude session. When a Stop notification is clicked (via `terminal-notifier` on macOS) or the **Reveal** action button on the VS Code toast, the extension now reveals the specific integrated terminal or editor panel where Claude was running — not just the workspace window. Implementation: Stop hooks capture the ancestor PID chain on macOS/Linux and send it in the v2 signal; the extension matches a terminal's `processId` against the chain and falls back to `claude-vscode.editor.open <session_id>` for editor panels. Original feature idea by [@marco-lavagnino](https://github.com/marco-lavagnino) in [#15](https://github.com/ashmitb95/claude-notifier/pull/15).
- Permission and question macOS notifications are now clickable. Previously, clicking either notification opened Script Editor (they were emitted through `osascript`). They now go through `terminal-notifier` like the Stop notification: clicks run `code <cwd>` to focus the matching VS Code window — falling back to `osascript activate` when the `code` CLI isn't on `PATH` — and write the firing cwd to `~/.claude/hooks/claude-notifier-focus` so the focus watcher reveals the originating Claude tab when one was previously recorded.
- Native Linux sound playback for the extension's own `done` notification. The in-extension `playLocalSound` (used when a VS Code window owns the session's cwd) previously handled only macOS and Windows, so the `done` chime fell silent on Linux; it now uses `paplay` (with `aplay` as fallback) and maps the sound presets to freedesktop sounds, matching the hook-side Linux behavior from 2.4.0. Contributed by [@collectifweb](https://github.com/collectifweb). ([#37](https://github.com/ashmitb95/claude-notifier/pull/37))

### Fixed

- Clicking a `done` notification (the macOS banner or the **Reveal** toast action) no longer opens a duplicate Claude chat tab. The `claude-vscode.editor.open <session_id>` fallback duplicated the tab because the Anthropic extension restores chat panels after a window reload without a session id, so the lookup always missed and a fresh tab was created. Chat sessions now rely on the existing window-forward step; integrated terminals still focus via PID match. ([#39](https://github.com/ashmitb95/claude-notifier/pull/39))

## [3.0.0] - 2026-05-16

### Added

- Per-session stage-based notification dedup. Multiple `done`/`input`/`question` events within the same session+stage coalesce to one notification per reason. Stage advances on the new `UserPromptSubmit` hook or after 30 minutes idle.
- `UserPromptSubmit` hook registered in `~/.claude/settings.json`. Coordination-only — no sound, popup, or settings knobs; signals the extension to advance the session's stage.
- "Claude Notifier" output channel (`View → Output → Claude Notifier`). Diagnostic log of activation, signal receipts, stage transitions, dedup decisions, configuration warnings.
- Bundled fallback sounds (`task-complete.wav`, `needs-input.wav`, `question.wav`) under `media/sounds/`. When the configured system sound file is missing on disk, the bundled fallback plays. Existing user sound choices are unchanged; defaults stay as system sounds.
- Signal format v2: `<reason> <ts> <session_id|-> [cwd]`. v1 format still parsed for back-compat with stale hook deployments.
- Shared hook library at `hook/_lib/*.js` and `hook/_lib.ps1`. Hook scripts shrunk 55–78%.
- `CONTRIBUTING.md` with dev setup, F5 debug, gate scripts, code map, PR conventions.
- GitHub issue + PR templates.
- vitest unit + hook test suites (~110 tests across `test/unit/` and `test/hook/`).
- ESLint flat config + Prettier + `tsc --strict` with `noUncheckedIndexedAccess`. Lint, format, typecheck, smoke npm scripts.
- GitHub Actions CI workflow across Linux / macOS / Windows.

### Changed

- Internal module split: `src/extension.ts` reduced from 536 to 52 lines; logic distributed across `src/{paths,log,signals,hooks,settings,routing,notifications,ui}/`.
- `package.json` default sounds reorganized to align with the new bundled fallback resolution path. User-selected presets unchanged.

### Fixed

- Shell-injection footgun in Linux `notify-send` and macOS `osascript` paths — both now use `execFileSync` to bypass the shell.

### Deprecated

- `claudeNotifier.doneDebounceMs`. Per-session stage dedup replaces it; the value is read but ignored. A one-line notice logs to the output channel the first time an explicit value is detected. Will be removed in a future release.

## [2.4.0] - 2026-05-14

Contributions in this release by [@collectifweb](https://github.com/collectifweb).

### Added

- Native Linux support for sound and OS notifications. On non-WSL Linux, hooks now use `paplay` (with `aplay` as fallback) for audio and `notify-send` for notifications, with the macOS sound preset names mapped to freedesktop XDG sounds under `/usr/share/sounds/freedesktop/stereo/`. Previously, native Linux fell through to the macOS-only `afplay` path and failed silently. ([#13](https://github.com/ashmitb95/claude-notifier/pull/13))

### Documentation

- README updated to list Linux alongside macOS, Windows, and WSL, including runtime dependencies (`libnotify`, PulseAudio/PipeWire or ALSA, `sound-theme-freedesktop`) and the new platform-support row.

## [2.3.1] - 2026-05-03

### Documentation

- README: added a "Clickable macOS notifications (optional)" subsection covering `terminal-notifier` install (via `brew` or the bundled command) and the graceful fallback when it's not present.

## [2.3.0] - 2026-05-03

### Added

- Clickable macOS notifications via [`terminal-notifier`](https://github.com/julienXX/terminal-notifier). When installed, clicks (and the action button) focus the specific VS Code window the notification fired from instead of opening Script Editor. Falls back to the previous `osascript` notification when `terminal-notifier` is not present. ([#12](https://github.com/ashmitb95/claude-notifier/issues/12))
- New command **"Claude Notifier: Install terminal-notifier (clickable macOS notifications)"** — detects Homebrew, opens an interactive terminal, and runs `brew install terminal-notifier` so the user sees the install output. Reload the window after install to pick up the new behavior.
- Per-window routing: Stop hooks include the firing session's `cwd`, and each VS Code window only fires a notification when the `cwd` is inside one of its workspace folders. Two parallel Claude sessions in two different windows now produce two notifications, each in the correct window.

### Fixed

- The notifier now keeps working in terminal Claude / the Claude desktop app after VS Code is closed. Previously, closing the last VS Code window tore down the hook scripts entirely; now teardown only happens on actual extension uninstall (via `vscode:uninstall`). The hook's existing terminal-fallback path delivers sound and system notification when no VS Code window is active.

## [2.2.0] - 2026-04-15

Contributions in this release by [@agrigoriev](https://github.com/agrigoriev).

### Added

- Configurable debounce interval for task-completion notifications, suppressing rapid-fire alerts during back-to-back completions.
- Improved notification handling and sound playback logic for more reliable cross-platform behavior.

### Fixed

- The question hook now guards against a missing `matcher` field. A misconfigured `PreToolUse` entry without `matcher: "AskUserQuestion"` previously fired the question notification on every tool call; the extension's setup check now rewrites such stale entries. ([#9](https://github.com/ashmitb95/claude-notifier/issues/9), [#10](https://github.com/ashmitb95/claude-notifier/pull/10))
- Replaced the single `claude-notifier-active` flag file with a `claude-notifier-active.d/` directory containing one PID-named marker per live extension instance. This resolves two coordination bugs in the extension↔hook active-flag protocol: a stale flag lingering after an extension-host crash caused stop hooks to defer indefinitely; and with multiple VS Code windows open, the first to deactivate would tear down hooks while other windows remained active. Hooks now verify that at least one marker corresponds to a live process before deferring. ([#8](https://github.com/ashmitb95/claude-notifier/issues/8), [#9](https://github.com/ashmitb95/claude-notifier/issues/9))

## [2.1.1] - 2026-04-03

### Fixed

- Windows hook scripts now correctly read VS Code settings. `$env:USERPROFILE` was not resolving when Claude Code spawned PowerShell with `-NoProfile -NonInteractive`, causing sound and notification level settings to be silently ignored and always falling back to defaults. Replaced with `$PSScriptRoot`, which reliably points to the hooks directory in all execution contexts. ([#4](https://github.com/ashmitb95/claude-notifier/issues/4))

### Added

- Remote session support: when Claude Code runs on a remote host (SSH, Dev Containers, WSL), the extension now plays a terminal bell via VS Code's BEL sequence, which is forwarded to the local client. Webview audio is blocked by Electron's autoplay policy in remote contexts, making this the reliable fallback.
  ([#3](https://github.com/ashmitb95/claude-notifier/issues/3)) — thanks [@agrigoriev](https://github.com/agrigoriev)

## [2.1.0] - 2026-03-20

### Fixed

- Marketplace republish to resolve extension visibility issue.

## [2.0.0] - 2026-03-05

### Added

- Per-event notification levels: `sound+popup`, `sound`, `popup`, or `off` — configurable independently for task completion, permission requests, and questions.
- Per-event sound presets for both macOS (Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink) and Windows (Windows Notify, tada, chimes, chord, ding, notify, ringin, Windows Background).
- Settings sync: VS Code settings are written to `~/.claude/hooks/claude-notifier-config.json` and picked up by hook scripts at runtime.

## [1.0.0] - 2026-02-20

### Added

- Three distinct hooks: `Stop` (task completed), `PermissionRequest` (needs tool approval), `PreToolUse` for `AskUserQuestion` (question asked).
- macOS and Windows support via platform-specific hook scripts (Node.js / PowerShell).
- WSL detection: WSL sessions call `powershell.exe` for sounds and notifications.
- Mute toggle via status bar icon or command palette (`Claude Notifier: Toggle Sound`).
- Auto-configures `~/.claude/settings.json` on activation, cleans up on uninstall.
- Homebrew tap support for macOS/Linux CLI install.

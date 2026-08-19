# Changelog

## [4.0.0] - 2026-08-19

### Added

- **Codex support.** Codex sessions now drive the same notification pipeline as Claude Code — the same sounds, per-event levels, mute, auto-mute, threshold, dedup, and remote audio. Codex's hook system turns out to be a close clone of Claude Code's, down to the payload field names (`cwd`, `session_id`, `stop_hook_active`), so the existing hook scripts serve both agents; they take an `--agent` argument that only decides how notifications are worded. The extension registers `Stop`, `PermissionRequest`, `UserPromptSubmit`, and `SubagentStop` in `~/.codex/hooks.json` (honouring `CODEX_HOME`), merging alongside any hooks another tool registered and leaving them intact. Registration is skipped entirely when Codex isn't installed, so no `~/.codex` directory is created for users who don't have it; `claudeNotifier.codex.enabled` opts out otherwise. Notifier state — signal file, config, mute flag, active markers — stays in `~/.claude/hooks/` for every agent, so there is still one signal file and one watcher. Codex has no `AskUserQuestion` analog, so `asksQuestion` remains Claude-Code-only. Setup and troubleshooting: [docs/CODEX.md](docs/CODEX.md). ([#83](https://github.com/ashmitb95/claude-notifier/issues/83))

  Codex gates newly registered hooks behind a trust prompt, and the extension deliberately does not grant that trust on the user's behalf — it could, since trust is just a hash recorded in `config.toml`, but that would defeat a control Codex added on purpose. Because Codex pins trust to a hash of the *registration entry* rather than the script contents, approving once survives extension upgrades that rewrite the scripts; the registered command line is kept byte-stable to preserve that. Our entry is registered first for each event so a third-party hook appearing later can't shift the index its trust key is derived from.

  Trusting is a one-time step in the **terminal**: `codex` opens a "Hooks need review" screen at startup offering *Trust all and continue*. It has to be the terminal — the app-server protocol the Codex VS Code extension speaks exposes only `hooks/list`, with no method for granting trust. The trust key carries no project component, so approving once covers every project and the VS Code extension alike. Until it happens, the failure is silent and gives no hint of the cause: the hooks parse cleanly, `hooks/list` reports no warnings or errors, and Codex just never invokes them. The README and [docs/CODEX.md](docs/CODEX.md) now walk through the screen by name, and the registration toast points at it rather than saying Codex will ask — it doesn't ask unless you start it in a terminal. Both also cover the `codex: command not found` that trips up anyone whose Codex arrived as the ChatGPT VS Code extension, which bundles the CLI inside the extension directory instead of putting it on `PATH` — the one-time approval is unreachable without it.

### Changed

- Added the `keywords` the manifest had never declared, and an explicit note that this is an independent extension not affiliated with Anthropic or OpenAI. The Marketplace title is unchanged for now.

## [3.7.0] - 2026-08-19

### Added

- **Notifications are titled with the workspace name.** The OS notification title was hardcoded to "Claude Notifier" on every path, so with several projects open the banners were indistinguishable — you had to switch windows to find out which one finished. Each notification is now titled with the project instead: a saved multi-root workspace uses the `.code-workspace` name, otherwise the workspace folder owning the firing `cwd` (falling back to the first folder), and a folderless window uses the `cwd`'s own name. Hook-fired notifications use the leaf of the firing directory. Both fall back to "Claude Notifier" when nothing resolves. Contributed by [@marco-lavagnino](https://github.com/marco-lavagnino). ([#87](https://github.com/ashmitb95/claude-notifier/pull/87))

### Fixed

- **An apostrophe in a notification message broke the macOS fallback notification.** When `terminal-notifier` isn't installed, the extension posts notifications via `osascript`, and the AppleScript was embedded in a single-quoted shell string — so any message containing `'` produced a malformed command and no notification at all. The script is now shell-quoted as a whole. Pre-existing since the osascript fallback was added; found while making the title user-supplied data. ([#87](https://github.com/ashmitb95/claude-notifier/pull/87))

## [3.6.0] - 2026-07-10

### Added

- **Auto-mute when focused.** New opt-in setting `claudeNotifier.autoMuteWhenFocused` (default `false`) suppresses the task-completed sound and all popups while the VS Code window running the task is focused — if you're already looking at the window, the notification is redundant. Suppression is scoped **per-window**: a task finishing in a background window still notifies, so multi-window / tabbed setups are never silenced (the global mute flag is untouched). Permission and question sounds still play. Toggle it from the status-bar hover panel or the new **Claude Notifier: Toggle Auto-mute When Focused** command. ([#71](https://github.com/ashmitb95/claude-notifier/issues/71))

### Fixed

- **Spurious notifications inside Cursor.** Cursor executes `~/.claude/settings.json` hooks from its own Composer agent, so finishing a turn in Cursor fired the notifier's sound + popup even though no Claude Code session was involved. The hooks now detect Cursor (its `CURSOR_*` environment, plus its bundle id on macOS) and exit at the top — no sound, no popup, and no signal. Suppressing the signal is what also silences the VS Code extension: the extension reads the signal file and can't detect Cursor on its own, so a Cursor turn on a project also open in VS Code was still firing a notification until the hook stopped writing the signal. Terminal and remote Claude Code sessions still notify normally. ([#74](https://github.com/ashmitb95/claude-notifier/issues/74))
- **A VS Code window with no folder open fired a notification for every task.** Such a "loose tab" wrote an empty routing marker, which made it claim and handle `done` signals from _every_ project — a long-standing duplicate notification that auto-mute-when-focused made obvious (the stray window is never the focused one, so it always fired). A folderless window now acts only as a fallback: it handles a `done` signal only when no other live window owns that cwd, so it no longer fires for other windows' work, while a Claude session running _inside_ it still notifies under the normal focus rules.

## [3.5.2] - 2026-07-04

### Fixed

- **Signal routing failed on Windows when workspace paths differed only in case.** Path matching compared strings case-sensitively, so a `cwd` like `f:\Github\proj` would not match a workspace folder recorded as `F:\Github\proj`, and the notification was routed away. Paths are now normalized to lowercase on Windows before comparison, in all three path-matching functions (`cwdMatchesFolder` in the extension, plus the PowerShell and JS hook equivalents). Contributed by [@zwye](https://github.com/zwye). ([#75](https://github.com/ashmitb95/claude-notifier/pull/75))
- **Log timestamps showed UTC instead of local time.** The output-channel logger used `Date.toISOString()`, so timestamps were off by the user's UTC offset (e.g. 8 hours behind for UTC+8). They now render in the local timezone. Contributed by [@zwye](https://github.com/zwye). ([#72](https://github.com/ashmitb95/claude-notifier/pull/72))

## [3.5.0] - 2026-06-24

### Added

- **Remote-audio mode — hear notifications when Claude runs on a remote host.** When Claude Code runs over SSH / WSL / in a dev container, notification sounds can now play on your **local** machine instead of the (usually headless) remote — with your normal presets and volume, and no terminal bell. A small dependency-free helper, `cn-daemon` (Go, ~2.4 MB, source in [`daemon/`](daemon/), published per-platform to GitHub Releases by [`daemon-release.yml`](.github/workflows/daemon-release.yml)), runs locally and the remote pushes events to it over an SSH reverse forward. Opt-in via `claudeNotifier.remoteAudio.enabled` (default `false`) — existing local setups are unaffected. Hooks route all sound through a single `hook/_lib/emit.js` chokepoint that pushes when remote-audio is on and plays locally otherwise; the extension pushes the "done" sound the same way, falling back to the terminal bell when off. A **`Claude Notifier: Set up remote audio…`** command enables the setting, opens the releases page in your local browser, and shows the `RemoteForward` line. Setup guide: [docs/REMOTE_HOSTS.md](docs/REMOTE_HOSTS.md). Addresses the long-standing remote-no-sound reports ([#58](https://github.com/ashmitb95/claude-notifier/issues/58), [#3](https://github.com/ashmitb95/claude-notifier/issues/3)).

## [3.4.0] - 2026-06-21

### Added

- **`CLAUDE_NOTIFIER_DISABLE` environment variable** for per-session opt-out. Setting it (to any value other than empty/`0`/`false`) in a shell makes every hook exit silently — no sound, popup, or signal — for sessions in that shell only, leaving other sessions and the machine-wide mute flag untouched. Intended for shared SSH hosts, where the host's hooks otherwise play sounds for every user's sessions. ([#63](https://github.com/ashmitb95/claude-notifier/issues/63))

## [3.3.2] - 2026-06-05

### Fixed

- **Static instead of sound on Linux without PulseAudio.** The Linux audio path tried `paplay` and fell back to `aplay`. The preset sounds are Ogg (`.oga`) files, which `aplay` (a raw ALSA/WAV player) cannot decode — it renders them as static. On modern PipeWire-based distros (e.g. Ubuntu 24.04+) `paplay` isn't installed by default, so playback fell through to `aplay` and produced static in every scenario. The player chain now tries `pw-play` (PipeWire) first, then `paplay` (PulseAudio), then `aplay`, so audio works out of the box on PipeWire systems. This bug had been latent since Linux support was added in 2.4.0 and was exposed by distros moving to PipeWire. ([#49](https://github.com/ashmitb95/claude-notifier/issues/49))

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

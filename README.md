# Claude Notifier

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/SingularityInc.claude-notifier)](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier)

Plays a sound and shows a notification when [Claude Code](https://claude.com/claude-code) finishes a task, needs permission, or asks a question.

Stop watching the screen — go grab a coffee and let Claude ping you when it needs you.

Works with **VSCode**, **terminal CLI**, **vim**, or any editor where you use Claude Code — on **macOS**, **Windows**, **WSL**, and **Linux**.

## Install

### Option 1: VSCode Extension

Install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=SingularityInc.claude-notifier):

```sh
code --install-extension SingularityInc.claude-notifier
```

Or search for **"Claude Notifier"** in the Extensions tab (`Cmd+Shift+X` / `Ctrl+Shift+X`).

The extension auto-configures everything on activation. Reload VSCode after installing.

### Option 2: Homebrew (macOS / Linux)

```sh
brew tap ashmitb95/claude-notifier
brew install claude-notifier
```

If `brew install` fails (e.g. outdated Command Line Tools), use the curl method below.

To uninstall:

```sh
brew uninstall claude-notifier
claude-notifier-uninstall  # remove hooks from ~/.claude/settings.json
```

### Option 3: CLI (curl)

**macOS / Linux / WSL:**

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
```

To uninstall:

```sh
curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash
```

**Windows:** install the VSCode extension. It auto-configures the PowerShell hooks; no separate CLI installer is needed.

## Settings

Open **Settings** → search **"Claude Notifier"** (`Cmd+,` / `Ctrl+,`), or add to your `settings.json`:

```jsonc
{
  // Per-event notification level: "sound+popup" | "sound" | "popup" | "off"
  "claudeNotifier.taskCompleted.level": "sound+popup",
  "claudeNotifier.needsPermission.level": "sound+popup",
  "claudeNotifier.asksQuestion.level": "sound+popup",

  // Per-event sound preset (see list below)
  "claudeNotifier.taskCompleted.sound": "Hero",
  "claudeNotifier.needsPermission.sound": "Glass",
  "claudeNotifier.asksQuestion.sound": "Funk"
}
```

**Notification levels:**

| Level         | Sound | OS notification | VSCode toast |
| ------------- | ----- | --------------- | ------------ |
| `sound+popup` | Yes   | Yes             | Yes          |
| `sound`       | Yes   | No              | No           |
| `popup`       | No    | Yes             | Yes          |
| `off`         | No    | No              | No           |

**Sound presets:**
- macOS: Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink
- Windows: Windows Notify, tada, chimes, chord, ding, notify, ringin, Windows Background
- Linux: same names as macOS — each is mapped to a freedesktop XDG sound under `/usr/share/sounds/freedesktop/stereo/`

The global **mute toggle** (status bar speaker icon or `Claude Notifier: Toggle Sound` in the command palette) overrides all per-event settings.

## How it works

Three [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) are registered:

| Hook                           | Trigger                    |
| ------------------------------ | -------------------------- |
| `Stop`                         | Claude finishes responding |
| `PermissionRequest`            | Claude needs tool approval |
| `PreToolUse` (AskUserQuestion) | Claude asks a question     |

Each hook reads `~/.claude/hooks/claude-notifier-config.json` (synced from VSCode settings) to determine which sound to play and whether to show notifications.

On **macOS**, hooks use `afplay` and `osascript`. On **Windows** and **WSL**, hooks use PowerShell with `NotifyIcon` balloon tips and system sounds. On **Linux**, hooks use `paplay` (with `aplay` as fallback) for audio and `notify-send` for notifications — install `libnotify` (`notify-send`), a PulseAudio/PipeWire or ALSA stack, and the `sound-theme-freedesktop` package if they aren't already present.

### Clickable macOS notifications (optional)

By default, macOS attributes `osascript` notifications to the Script Editor bundle, so clicking one opens Script Editor instead of focusing VS Code. To get clickable notifications that focus the specific window the notification fired from, install [`terminal-notifier`](https://github.com/julienXX/terminal-notifier):

```sh
brew install terminal-notifier
```

Or use the bundled command — open the Command Palette and run **"Claude Notifier: Install terminal-notifier (clickable macOS notifications)"**. It runs the `brew install` in an interactive VS Code terminal so you can see what's happening. Reload the window after install to enable it.

When `terminal-notifier` is present, the extension uses it automatically. When it's not, the extension falls back to the standard `osascript` notification (everything still works — clicks just open Script Editor).

## Mute/unmute (CLI)

**macOS / Linux / WSL:**

```sh
touch ~/.claude/hooks/claude-notifier-muted   # mute
rm ~/.claude/hooks/claude-notifier-muted      # unmute
```

**Windows PowerShell:**

```powershell
New-Item "$env:USERPROFILE\.claude\hooks\claude-notifier-muted"   # mute
Remove-Item "$env:USERPROFILE\.claude\hooks\claude-notifier-muted" # unmute
```

## Platform support

| Platform | VSCode Extension | CLI Install | Hook runner                                               |
| -------- | ---------------- | ----------- | --------------------------------------------------------- |
| macOS    | Yes              | Yes         | Node.js                                                   |
| Windows  | Yes              | VSCode only | PowerShell                                                |
| WSL      | Yes              | Yes         | Node.js (calls `powershell.exe` for sounds/notifications) |
| Linux    | Yes              | Yes         | Node.js (uses `paplay`/`aplay` and `notify-send`)         |

## Contributing

Bug reports and feature requests are welcome — please [open an issue](https://github.com/ashmitb95/claude-notifier/issues/new) first so we can discuss the change before code is written. For pull requests:

- Branch from `main` and keep changes focused — one fix or feature per PR.
- Follow the existing commit style (`fix:`, `feat:`, `chore:` …).
- Test your changes locally on the platform(s) you've touched (macOS, Windows, WSL, or Linux) and note what you verified in the PR description.

### Contributors

Thanks to everyone who has contributed to this project:

[![Contributors](https://contrib.rocks/image?repo=ashmitb95/claude-notifier)](https://github.com/ashmitb95/claude-notifier/graphs/contributors)

## License

[GPL-3.0](LICENSE.md)

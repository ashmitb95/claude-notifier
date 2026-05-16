import * as path from "path";

export const HOME = process.env.HOME || process.env.USERPROFILE || "~";
export const CLAUDE_DIR = path.join(HOME, ".claude");
export const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
export const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
export const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
export const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
export const FOCUS_SIGNAL_FILE = path.join(HOOKS_DIR, "claude-notifier-focus");
export const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");

// Directory of per-PID marker files. Hooks treat the extension as active if
// any marker inside corresponds to a live PID. Using a directory (instead of a
// single flag file) lets multiple VSCode windows coexist and survives crashes:
// stale markers get cleaned up on next activate and ignored via PID liveness.
export const ACTIVE_DIR = path.join(HOOKS_DIR, "claude-notifier-active.d");
export const OWN_PID_FILE = path.join(ACTIVE_DIR, String(process.pid));

export const IS_WIN = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";
export const HOOK_EXT = IS_WIN ? ".ps1" : ".js";

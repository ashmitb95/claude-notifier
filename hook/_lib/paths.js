const path = require("path");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
const ACTIVE_DIR = path.join(HOOKS_DIR, "claude-notifier-active.d");

module.exports = { HOOKS_DIR, MUTE_FLAG, SIGNAL_FILE, CONFIG_FILE, ACTIVE_DIR };

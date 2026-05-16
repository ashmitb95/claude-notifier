const path = require("path");
const { USE_WIN, IS_LINUX } = require("./platform");

// Bundled fallback sounds ship inside the .vsix at <ext>/media/sounds/, and
// setupHooks copies them alongside this file to ~/.claude/hooks/_lib/sounds/.
// playSound() uses these only when the configured primary file doesn't exist
// (system sound theme missing, cross-platform misconfig, etc.). User-selected
// presets are still the default; this is purely a resilience fallback.
const BUNDLED_SOUNDS_DIR = path.join(__dirname, "sounds");
const BUNDLED_FALLBACK = {
  taskCompleted: path.join(BUNDLED_SOUNDS_DIR, "task-complete.wav"),
  needsPermission: path.join(BUNDLED_SOUNDS_DIR, "needs-input.wav"),
  asksQuestion: path.join(BUNDLED_SOUNDS_DIR, "question.wav"),
};

const MACOS_SOUNDS = {
  Basso: "/System/Library/Sounds/Basso.aiff",
  Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff",
  Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff",
  Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff",
  Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff",
  Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff",
  Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff",
  Tink: "/System/Library/Sounds/Tink.aiff",
};

const WIN_SOUNDS = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav",
  tada: "C:\\Windows\\Media\\tada.wav",
  chimes: "C:\\Windows\\Media\\chimes.wav",
  chord: "C:\\Windows\\Media\\chord.wav",
  ding: "C:\\Windows\\Media\\ding.wav",
  notify: "C:\\Windows\\Media\\notify.wav",
  ringin: "C:\\Windows\\Media\\ringin.wav",
  "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

const LINUX_SOUNDS_DIR = "/usr/share/sounds/freedesktop/stereo";
const LINUX_SOUNDS = {
  Basso: `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Blow: `${LINUX_SOUNDS_DIR}/service-logout.oga`,
  Bottle: `${LINUX_SOUNDS_DIR}/bell.oga`,
  Frog: `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Funk: `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Glass: `${LINUX_SOUNDS_DIR}/bell.oga`,
  Hero: `${LINUX_SOUNDS_DIR}/complete.oga`,
  Morse: `${LINUX_SOUNDS_DIR}/message.oga`,
  Ping: `${LINUX_SOUNDS_DIR}/message.oga`,
  Pop: `${LINUX_SOUNDS_DIR}/dialog-information.oga`,
  Purr: `${LINUX_SOUNDS_DIR}/service-login.oga`,
  Sosumi: `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Submarine: `${LINUX_SOUNDS_DIR}/alarm-clock-elapsed.oga`,
  Tink: `${LINUX_SOUNDS_DIR}/bell.oga`,
};

/**
 * Resolve a sound preset name to an absolute file path for the current platform.
 * Falls back to the platform-specific default when the name is missing or unknown.
 */
function resolveSound(name, defaultMac, defaultWin) {
  if (USE_WIN) return WIN_SOUNDS[name] || defaultWin;
  if (IS_LINUX) return LINUX_SOUNDS[name] || `${LINUX_SOUNDS_DIR}/complete.oga`;
  return MACOS_SOUNDS[name] || defaultMac;
}

module.exports = {
  MACOS_SOUNDS,
  WIN_SOUNDS,
  LINUX_SOUNDS,
  LINUX_SOUNDS_DIR,
  BUNDLED_SOUNDS_DIR,
  BUNDLED_FALLBACK,
  resolveSound,
};

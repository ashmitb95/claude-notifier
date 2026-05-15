const { USE_WIN, IS_LINUX } = require("./platform");

const MACOS_SOUNDS = {
  Basso: "/System/Library/Sounds/Basso.aiff", Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff", Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff", Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff", Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff", Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff", Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff", Tink: "/System/Library/Sounds/Tink.aiff",
};

const WIN_SOUNDS = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav", "tada": "C:\\Windows\\Media\\tada.wav",
  "chimes": "C:\\Windows\\Media\\chimes.wav", "chord": "C:\\Windows\\Media\\chord.wav",
  "ding": "C:\\Windows\\Media\\ding.wav", "notify": "C:\\Windows\\Media\\notify.wav",
  "ringin": "C:\\Windows\\Media\\ringin.wav", "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

const LINUX_SOUNDS_DIR = "/usr/share/sounds/freedesktop/stereo";
const LINUX_SOUNDS = {
  Basso:     `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Blow:      `${LINUX_SOUNDS_DIR}/service-logout.oga`,
  Bottle:    `${LINUX_SOUNDS_DIR}/bell.oga`,
  Frog:      `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Funk:      `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Glass:     `${LINUX_SOUNDS_DIR}/bell.oga`,
  Hero:      `${LINUX_SOUNDS_DIR}/complete.oga`,
  Morse:     `${LINUX_SOUNDS_DIR}/message.oga`,
  Ping:      `${LINUX_SOUNDS_DIR}/message.oga`,
  Pop:       `${LINUX_SOUNDS_DIR}/dialog-information.oga`,
  Purr:      `${LINUX_SOUNDS_DIR}/service-login.oga`,
  Sosumi:    `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Submarine: `${LINUX_SOUNDS_DIR}/alarm-clock-elapsed.oga`,
  Tink:      `${LINUX_SOUNDS_DIR}/bell.oga`,
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
  MACOS_SOUNDS, WIN_SOUNDS, LINUX_SOUNDS, LINUX_SOUNDS_DIR,
  resolveSound,
};

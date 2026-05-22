import { exec } from "child_process";
import { IS_WIN, IS_LINUX } from "../paths";

export const MACOS_SOUNDS: Record<string, string> = {
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

export const WIN_SOUNDS: Record<string, string> = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav",
  tada: "C:\\Windows\\Media\\tada.wav",
  chimes: "C:\\Windows\\Media\\chimes.wav",
  chord: "C:\\Windows\\Media\\chord.wav",
  ding: "C:\\Windows\\Media\\ding.wav",
  notify: "C:\\Windows\\Media\\notify.wav",
  ringin: "C:\\Windows\\Media\\ringin.wav",
  "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

export const LINUX_SOUNDS_DIR = "/usr/share/sounds/freedesktop/stereo";
export const LINUX_SOUNDS: Record<string, string> = {
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

export function playLocalSound(soundName: string, defaultMac: string, defaultWin: string): void {
  if (IS_WIN) {
    const soundPath = WIN_SOUNDS[soundName] || defaultWin;
    const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
      { timeout: 5000 }
    );
  } else if (IS_LINUX) {
    // paplay (PulseAudio/PipeWire) preferred; aplay (ALSA) as fallback.
    // Mirrors the hook-side logic in hook/_lib/play.js so terminal + extension
    // playback stay in sync on Linux.
    const soundPath = LINUX_SOUNDS[soundName] || `${LINUX_SOUNDS_DIR}/complete.oga`;
    exec(`paplay "${soundPath}" 2>/dev/null || aplay "${soundPath}" 2>/dev/null`, {
      timeout: 5000,
    });
  } else {
    const soundPath = MACOS_SOUNDS[soundName] || defaultMac;
    exec(`afplay "${soundPath}"`);
  }
}

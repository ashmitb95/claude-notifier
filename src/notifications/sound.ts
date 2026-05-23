import { exec } from "child_process";
import { IS_WIN, IS_LINUX } from "../paths";
import { clampVolume, DEFAULT_VOLUME } from "../settings/sync";

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

export function playLocalSound(
  soundName: string,
  defaultMac: string,
  defaultWin: string,
  volume: number = DEFAULT_VOLUME
): void {
  const v = clampVolume(volume);
  if (IS_WIN) {
    // Media.SoundPlayer has no volume control; volume is ignored on Windows.
    const soundPath = WIN_SOUNDS[soundName] || defaultWin;
    const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
      { timeout: 5000 }
    );
  } else if (IS_LINUX) {
    // paplay --volume uses a 16-bit scale where 65536 = 100%. aplay has no
    // matching flag, so the fallback path plays at system volume.
    const soundPath = LINUX_SOUNDS[soundName] || `${LINUX_SOUNDS_DIR}/complete.oga`;
    const paVolume = Math.round(v * 65536);
    exec(
      `paplay --volume=${paVolume} "${soundPath}" 2>/dev/null || aplay "${soundPath}" 2>/dev/null`,
      { timeout: 5000 }
    );
  } else {
    // afplay -v takes a 0.0–2.0+ multiplier (1.0 = system volume).
    const soundPath = MACOS_SOUNDS[soundName] || defaultMac;
    exec(`afplay -v ${v} "${soundPath}"`);
  }
}

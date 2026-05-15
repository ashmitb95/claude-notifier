const { execSync } = require("child_process");
const { USE_WIN, IS_LINUX, PS_BIN } = require("./platform");

/**
 * Play a sound file using the platform-native player. Silently swallows errors
 * — sound failure should never break a hook.
 */
function playSound(soundPath) {
  try {
    if (USE_WIN) {
      const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
    } else if (IS_LINUX) {
      // paplay (PulseAudio/PipeWire) preferred; aplay (ALSA) as fallback.
      execSync(`paplay "${soundPath}" 2>/dev/null || aplay "${soundPath}" 2>/dev/null`, { stdio: "ignore", timeout: 5000 });
    } else {
      execSync(`afplay "${soundPath}"`, { stdio: "ignore" });
    }
  } catch {}
}

module.exports = { playSound };

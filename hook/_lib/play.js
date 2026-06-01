const fs = require("fs");
const { execSync } = require("child_process");
const { USE_WIN, IS_LINUX, PS_BIN } = require("./platform");
const { isInsideCmux } = require("./cmux");

function clampVolume(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 2) return 2;
  return v;
}

/**
 * Play a sound file using the platform-native player. Silently swallows errors
 * — sound failure should never break a hook.
 *
 * @param {string} primaryPath  Primary (usually system) sound file.
 * @param {string} [fallbackPath]  Bundled fallback played when primary doesn't
 *   exist on disk — covers Linux without sound-theme-freedesktop installed,
 *   cross-platform misconfig, removed system sounds, etc.
 * @param {number} [volume=1]  Volume multiplier (0–2). 1 = system default.
 *   Honored on Linux (paplay) and macOS (afplay). Windows ignores it because
 *   Media.SoundPlayer has no volume API.
 */
function playSound(primaryPath, fallbackPath, volume = 1) {
  // cmux posts its own banner for the same event; skip the sound to avoid
  // double-notifying. See _lib/cmux.js.
  if (isInsideCmux()) return;
  const soundPath =
    primaryPath && fs.existsSync(primaryPath) ? primaryPath : fallbackPath || primaryPath;
  if (!soundPath) return;
  const v = clampVolume(volume);
  try {
    if (USE_WIN) {
      const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      execSync(
        `${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
        { stdio: "ignore", timeout: 5000 }
      );
    } else if (IS_LINUX) {
      // paplay --volume uses a 16-bit scale where 65536 = 100%.
      const paVolume = Math.round(v * 65536);
      execSync(
        `paplay --volume=${paVolume} "${soundPath}" 2>/dev/null || aplay "${soundPath}" 2>/dev/null`,
        { stdio: "ignore", timeout: 5000 }
      );
    } else {
      execSync(`afplay -v ${v} "${soundPath}"`, { stdio: "ignore" });
    }
  } catch {}
}

module.exports = { playSound };

const fs = require("fs");
const { execSync, execFileSync } = require("child_process");
const { USE_WIN, IS_LINUX, PS_BIN } = require("./platform");
const { isInsideCmux } = require("./cmux");

// PowerShell single-quoted strings escape ' as ''. Anything else is literal.
function psSingleQuoteEscape(s) {
  return String(s).replace(/'/g, "''");
}

// POSIX single-quoted literal — nothing inside is special except ' itself.
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

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
      const ps = `$s='${psSingleQuoteEscape(soundPath)}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
      execSync(
        `${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
        { stdio: "ignore", timeout: 5000 }
      );
    } else if (IS_LINUX) {
      // pw-play (PipeWire) / paplay (PulseAudio) decode .oga sounds; aplay is a
      // raw ALSA/WAV player and renders .oga as static (#49), so it is a last
      // resort. pw-play --volume is a 0.0–1.0+ linear factor; paplay --volume a
      // 16-bit scale where 65536 = 100%.
      const paVolume = Math.round(v * 65536);
      // Chaining the three players with || needs a shell, so the path is
      // quoted rather than passed as an argv entry.
      const q = shQuote(soundPath);
      execSync(
        `pw-play --volume=${v} ${q} 2>/dev/null || paplay --volume=${paVolume} ${q} 2>/dev/null || aplay ${q} 2>/dev/null`,
        { stdio: "ignore", timeout: 5000 }
      );
    } else {
      // execFileSync bypasses the shell — no quoting concerns for the path.
      execFileSync("afplay", ["-v", String(v), soundPath], { stdio: "ignore" });
    }
  } catch {}
}

module.exports = { playSound };

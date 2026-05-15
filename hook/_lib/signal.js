const fs = require("fs");
const { SIGNAL_FILE } = require("./paths");

/**
 * Write a signal for the extension to consume. Format: "<reason> <ts> <cwd?>".
 * cwd is optional — Stop includes it for per-window routing; others omit it.
 */
function writeSignal(reason, cwd) {
  try {
    const payload = cwd ? `${reason} ${Date.now()} ${cwd}` : `${reason} ${Date.now()}`;
    fs.writeFileSync(SIGNAL_FILE, payload);
  } catch {}
}

module.exports = { writeSignal };

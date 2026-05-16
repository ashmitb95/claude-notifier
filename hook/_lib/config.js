const fs = require("fs");
const { CONFIG_FILE, MUTE_FLAG } = require("./paths");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function isMuted() {
  return fs.existsSync(MUTE_FLAG);
}

module.exports = { readConfig, isMuted };

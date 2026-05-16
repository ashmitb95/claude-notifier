const fs = require("fs");

const IS_WIN = process.platform === "win32";
const IS_WSL =
  !IS_WIN &&
  process.platform === "linux" &&
  (() => {
    try {
      return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
    } catch {
      return false;
    }
  })();
const USE_WIN = IS_WIN || IS_WSL;
const PS_BIN = IS_WSL ? "powershell.exe" : "powershell";
const IS_LINUX = !IS_WIN && !IS_WSL && process.platform === "linux";
const IS_MAC = process.platform === "darwin";

module.exports = { IS_WIN, IS_WSL, USE_WIN, PS_BIN, IS_LINUX, IS_MAC };

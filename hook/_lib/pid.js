const { execFileSync } = require("child_process");
const { IS_WIN } = require("./platform");

function readParentPid(pid) {
  try {
    const out = execFileSync("/bin/ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf-8",
      timeout: 500,
    }).trim();
    const parsed = parseInt(out, 10);
    return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Walk the ancestor chain starting from the hook's parent process.
 * Returns ordered PIDs from immediate parent upward, stopping at init,
 * loops, or the depth cap. Empty array on Windows.
 */
function getAncestorPids(maxDepth = 10) {
  if (IS_WIN) return [];
  const chain = [];
  const seen = new Set();
  let cur = process.ppid;
  while (cur && cur > 1 && chain.length < maxDepth) {
    if (seen.has(cur)) break;
    seen.add(cur);
    chain.push(cur);
    const next = readParentPid(cur);
    if (!next) break;
    cur = next;
  }
  return chain;
}

module.exports = { getAncestorPids };

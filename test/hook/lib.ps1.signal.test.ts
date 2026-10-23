import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LIB = path.join(__dirname, "..", "..", "hook", "_lib.ps1");

// Windows PowerShell 5.1 runs the hooks. The cwd is passed as an argument
// (UTF-16 on the Windows command line) so the probe file itself stays ASCII.
const PROBE = `param([string]$Lib, [string]$Signal, [string]$Cwd)
. $Lib
$LibSignalFile = $Signal
Write-NotifierSignal -Reason 'done' -SessionId 'abc-123' -Cwd $Cwd
`;

describe.skipIf(process.platform !== "win32")("hook/_lib.ps1 — Write-NotifierSignal", () => {
  it("writes a non-ASCII cwd as BOM-less UTF-8", () => {
    const cwd = "C:\\Users\\me\\OneDrive\\ドキュメント\\Relatório";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-ps1-"));
    try {
      const probe = path.join(dir, "probe.ps1");
      const signal = path.join(dir, "claude-signal");
      fs.writeFileSync(probe, PROBE);

      const res = spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          probe,
          LIB,
          signal,
          cwd,
        ],
        { encoding: "utf-8" }
      );
      expect(res.status).toBe(0);

      const bytes = fs.readFileSync(signal);
      expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
      const content = bytes.toString("utf-8");
      expect(content).toMatch(/^done \d+(\.\d+)? abc-123 /);
      expect(content.endsWith(` ${cwd}`)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

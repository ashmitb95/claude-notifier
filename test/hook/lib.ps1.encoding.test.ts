import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LIB = path.join(__dirname, "..", "..", "hook", "_lib.ps1");

// Windows PowerShell 5.1 runs the hooks. Text is round-tripped as UTF-16 code
// units in hex so the assertion doesn't depend on the console's output encoding.
const PROBE = `param([string]$Lib, [string]$Config, [string]$Transcript)
. $Lib
$LibConfigFile = $Config
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
$values = [ordered]@{
    stdin  = "$($data.msg)"
    config = "$((Read-NotifierConfig).taskCompleted.label)"
    title  = "$(Get-NotifierChatTitle $Transcript '' '')"
}
foreach ($key in $values.Keys) {
    "$key=" + (($values[$key].ToCharArray() | ForEach-Object { '{0:x4}' -f [int]$_ }) -join ' ')
}
`;

describe.skipIf(process.platform !== "win32")("hook/_lib.ps1 — UTF-8 input", () => {
  it("decodes stdin, the config file and the transcript as UTF-8", () => {
    const expected = {
      stdin: "Relatório públicos",
      config: "✅ finished",
      title: "Relatório de defensores públicos",
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-ps1-"));
    try {
      const probe = path.join(dir, "probe.ps1");
      const config = path.join(dir, "config.json");
      const transcript = path.join(dir, "transcript.jsonl");
      fs.writeFileSync(probe, PROBE);
      fs.writeFileSync(config, JSON.stringify({ taskCompleted: { label: expected.config } }));
      fs.writeFileSync(
        transcript,
        JSON.stringify({ type: "ai-title", aiTitle: expected.title }) + "\n"
      );

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
          config,
          transcript,
        ],
        { input: JSON.stringify({ msg: expected.stdin }), encoding: "utf-8" }
      );
      const got: Record<string, string> = {};
      for (const line of res.stdout.split(/\r?\n/).filter(Boolean)) {
        const [key, hex] = line.split("=");
        got[key!] = hex
          ? String.fromCharCode(...hex.split(" ").map((unit) => parseInt(unit, 16)))
          : "";
      }
      expect(got).toEqual(expected);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

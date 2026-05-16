import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const HOOK_DIR = path.join(__dirname, "..", "..", "hook");

/** Path to a hook script in the source tree (uses _lib/ in the same dir). */
export function hookScript(name: string): string {
  return path.join(HOOK_DIR, `${name}.js`);
}

/**
 * Allocate an empty tmp HOME with a .claude/hooks/ scaffold. Caller owns
 * cleanup via the returned `dispose()` (or vitest's afterEach).
 */
export function tmpHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-notifier-test-"));
  const hooksDir = path.join(root, ".claude", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  return {
    root,
    hooksDir,
    signalFile: path.join(hooksDir, "claude-signal"),
    muteFlag: path.join(hooksDir, "claude-notifier-muted"),
    configFile: path.join(hooksDir, "claude-notifier-config.json"),
    activeDir: path.join(hooksDir, "claude-notifier-active.d"),
    dispose() {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {}
    },
  };
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run a hook script as a subprocess with synthetic stdin JSON, HOME pointed
 * at the test sandbox, and PATH stripped so afplay/paplay/notify-send/
 * osascript can't be found. The hook scripts wrap every spawn in try/catch
 * with stdio:ignore, so the missing-binary errors are swallowed silently
 * and the surrounding signal-write path still runs. Tests that explicitly
 * want sound/notification side effects can pass `keepPath: true`.
 */
export function runHook(
  scriptPath: string,
  stdin: unknown,
  home: string,
  opts: { keepPath?: boolean; extraEnv?: Record<string, string> } = {}
): RunResult {
  const started = Date.now();
  const res = spawnSync(process.execPath, [scriptPath], {
    input: typeof stdin === "string" ? stdin : JSON.stringify(stdin),
    env: {
      ...process.env,
      HOME: home,
      PATH: opts.keepPath ? (process.env.PATH ?? "") : "/",
      ...opts.extraEnv,
    },
    encoding: "utf-8",
    timeout: 8_000,
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    durationMs: Date.now() - started,
  };
}

/** Read the signal file or return "" if not present. */
export function readSignal(signalFile: string): string {
  try {
    return fs.readFileSync(signalFile, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Drop a PID-marker file into the active-extension directory so the on-stop
 * hook's `extensionOwnsCwd` short-circuits before invoking sound playback.
 * Uses the test process's own PID (alive while the test runs).
 */
export function simulateActiveExtension(activeDir: string, workspaceFolders: string[]): void {
  fs.mkdirSync(activeDir, { recursive: true });
  fs.writeFileSync(path.join(activeDir, String(process.pid)), workspaceFolders.join("\n"));
}

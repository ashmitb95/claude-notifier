import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ACTIVE_DIR, OWN_PID_FILE } from "../paths";

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getOwnWorkspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

export function writeOwnPidFile(): void {
  try {
    const folders = getOwnWorkspaceFolders().join("\n");
    fs.writeFileSync(OWN_PID_FILE, folders);
  } catch {}
}

export function cwdMatchesFolder(cwd: string, folder: string): boolean {
  if (!cwd || !folder) return false;
  // On Windows, paths are case-insensitive — normalize to lowercase for
  // parity with Test-CwdInsideFolder in hook/_lib.ps1 and cwdInsideFolder
  // in hook/_lib/active.js.
  const isWindows = process.platform === "win32";
  const normalize = (p: string) => (isWindows ? p.toLowerCase() : p);
  const normCwd = normalize(cwd);
  const normFolder = normalize(folder);
  if (normCwd === normFolder) return true;
  return normCwd.startsWith(normFolder.endsWith(path.sep) ? normFolder : normFolder + path.sep);
}

export function cleanStalePidFiles(): void {
  try {
    for (const name of fs.readdirSync(ACTIVE_DIR)) {
      const pid = parseInt(name, 10);
      if (!Number.isFinite(pid) || !isPidAlive(pid)) {
        try {
          fs.unlinkSync(path.join(ACTIVE_DIR, name));
        } catch {}
      }
    }
  } catch {}
}

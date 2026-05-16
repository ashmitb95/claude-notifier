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
  if (cwd === folder) return true;
  return cwd.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep);
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

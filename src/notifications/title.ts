import * as path from "path";
import * as vscode from "vscode";
import { getOwnWorkspaceFolders, cwdMatchesFolder } from "../routing/cwd";

export const DEFAULT_TITLE = "Claude Notifier";
const WORKSPACE_EXT = ".code-workspace";

/**
 * Title for OS notifications fired by this window: the name of the workspace,
 * so a user with several projects open can tell at a glance which one just
 * finished.
 *
 * Resolution order:
 *   1. saved multi-root workspace  → the .code-workspace basename, ext stripped
 *   2. the workspace folder owning `cwd` (dispatch has already established that
 *      this window owns it), else the first folder → its basename
 *   3. `cwd` itself → its basename (folderless window acting as fallback owner)
 *   4. "Claude Notifier"
 */
export function getWorkspaceTitle(cwd?: string): string {
  const wsFile = vscode.workspace.workspaceFile;
  if (wsFile && wsFile.scheme === "file") {
    const base = path.basename(wsFile.fsPath);
    const name = base.endsWith(WORKSPACE_EXT) ? base.slice(0, -WORKSPACE_EXT.length) : base;
    if (name) return name;
  }
  const folders = getOwnWorkspaceFolders();
  const owning = cwd ? folders.find((f) => cwdMatchesFolder(cwd, f)) : undefined;
  const folder = owning ?? folders[0];
  if (folder && path.basename(folder)) return path.basename(folder);
  if (cwd && path.basename(cwd)) return path.basename(cwd);
  return DEFAULT_TITLE;
}

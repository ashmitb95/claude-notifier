import { describe, it, expect, beforeEach } from "vitest";
import * as path from "path";
import * as vscode from "vscode";
import { getWorkspaceTitle, DEFAULT_TITLE } from "../../src/notifications/title";

const ws = vscode.workspace as { workspaceFolders: unknown; workspaceFile: unknown };

// cwdMatchesFolder uses path.sep at runtime, so build platform-correct paths
// (\ on Windows, / elsewhere) rather than hardcoding forward slashes.
const MY_APP = path.join(path.sep, "Users", "foo", "my-app");
const API = path.join(path.sep, "Users", "foo", "api");
const WEB = path.join(path.sep, "Users", "foo", "web");
const ELSEWHERE = path.join(path.sep, "elsewhere");
const LOOSE = path.join(path.sep, "Users", "foo", "loose-project");

function setFolders(...paths: string[]): void {
  ws.workspaceFolders = paths.length ? paths.map((p) => ({ uri: { fsPath: p } })) : undefined;
}

function setWorkspaceFile(fsPath: string | null, scheme = "file"): void {
  ws.workspaceFile = fsPath ? { fsPath, scheme } : undefined;
}

describe("notifications/title — getWorkspaceTitle", () => {
  beforeEach(() => {
    setFolders();
    setWorkspaceFile(null);
  });

  it("uses the folder name of a single-folder workspace", () => {
    setFolders(MY_APP);
    expect(getWorkspaceTitle(MY_APP)).toBe("my-app");
  });

  it("uses the folder name even when the cwd is a subdirectory", () => {
    setFolders(MY_APP);
    expect(getWorkspaceTitle(path.join(MY_APP, "packages", "api"))).toBe("my-app");
  });

  it("uses the .code-workspace name for a saved multi-root workspace", () => {
    setFolders(API, WEB);
    setWorkspaceFile(path.join(path.sep, "Users", "foo", "acme.code-workspace"));
    expect(getWorkspaceTitle(API)).toBe("acme");
  });

  it("keeps the basename when the workspace file has no .code-workspace suffix", () => {
    setWorkspaceFile(path.join(path.sep, "Users", "foo", "acme.json"));
    expect(getWorkspaceTitle(API)).toBe("acme.json");
  });

  it("picks the folder owning the cwd in an untitled multi-root workspace", () => {
    setFolders(API, WEB);
    setWorkspaceFile(path.join(path.sep, "Users", "foo", "Untitled"), "untitled");
    expect(getWorkspaceTitle(path.join(WEB, "src"))).toBe("web");
  });

  it("falls back to the first folder when the cwd matches none", () => {
    setFolders(API, WEB);
    expect(getWorkspaceTitle(ELSEWHERE)).toBe("api");
  });

  it("falls back to the cwd name when the window has no folder open", () => {
    expect(getWorkspaceTitle(LOOSE)).toBe("loose-project");
  });

  it("falls back to the default title with neither folder nor cwd", () => {
    expect(getWorkspaceTitle()).toBe(DEFAULT_TITLE);
    expect(getWorkspaceTitle("")).toBe(DEFAULT_TITLE);
  });
});

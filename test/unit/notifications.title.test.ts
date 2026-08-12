import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { getWorkspaceTitle, DEFAULT_TITLE } from "../../src/notifications/title";

const ws = vscode.workspace as { workspaceFolders: unknown; workspaceFile: unknown };

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
    setFolders("/Users/foo/my-app");
    expect(getWorkspaceTitle("/Users/foo/my-app")).toBe("my-app");
  });

  it("uses the folder name even when the cwd is a subdirectory", () => {
    setFolders("/Users/foo/my-app");
    expect(getWorkspaceTitle("/Users/foo/my-app/packages/api")).toBe("my-app");
  });

  it("uses the .code-workspace name for a saved multi-root workspace", () => {
    setFolders("/Users/foo/api", "/Users/foo/web");
    setWorkspaceFile("/Users/foo/acme.code-workspace");
    expect(getWorkspaceTitle("/Users/foo/api")).toBe("acme");
  });

  it("keeps the basename when the workspace file has no .code-workspace suffix", () => {
    setWorkspaceFile("/Users/foo/acme.json");
    expect(getWorkspaceTitle("/Users/foo/api")).toBe("acme.json");
  });

  it("picks the folder owning the cwd in an untitled multi-root workspace", () => {
    setFolders("/Users/foo/api", "/Users/foo/web");
    setWorkspaceFile("/Users/foo/Untitled", "untitled");
    expect(getWorkspaceTitle("/Users/foo/web/src")).toBe("web");
  });

  it("falls back to the first folder when the cwd matches none", () => {
    setFolders("/Users/foo/api", "/Users/foo/web");
    expect(getWorkspaceTitle("/elsewhere")).toBe("api");
  });

  it("falls back to the cwd name when the window has no folder open", () => {
    expect(getWorkspaceTitle("/Users/foo/loose-project")).toBe("loose-project");
  });

  it("falls back to the default title with neither folder nor cwd", () => {
    expect(getWorkspaceTitle()).toBe(DEFAULT_TITLE);
    expect(getWorkspaceTitle("")).toBe(DEFAULT_TITLE);
  });
});

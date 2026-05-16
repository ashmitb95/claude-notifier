// Minimal vscode API surface for vitest unit tests. Only the symbols actually
// imported by src/ modules under test are stubbed; missing properties throw
// at access time so we notice when a test depends on something not modeled.

export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: (_msg: string) => {},
    dispose: () => {},
  }),
  showInformationMessage: (_msg: string) => Promise.resolve(undefined),
  showWarningMessage: (_msg: string) => Promise.resolve(undefined),
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: "",
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  createTerminal: (_opts: unknown) => ({ show: () => {}, sendText: (_t: string) => {} }),
  terminals: [] as unknown[],
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue,
    update: (_key: string, _value: unknown) => Promise.resolve(),
    inspect: (_key: string) => undefined,
  }),
  onDidChangeConfiguration: (_handler: unknown) => ({ dispose: () => {} }),
  onDidChangeWorkspaceFolders: (_handler: unknown) => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: (_id: string, _handler: unknown) => ({ dispose: () => {} }),
  executeCommand: (_id: string, ..._args: unknown[]) => Promise.resolve(),
};

export const env = {
  appRoot: "/Applications/Visual Studio Code.app/Contents/Resources/app",
  remoteName: undefined as string | undefined,
  openExternal: (_uri: unknown) => Promise.resolve(true),
};

export const Uri = {
  parse: (s: string) => ({ toString: () => s }),
};

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

export class Disposable {
  static from(..._disposables: { dispose: () => unknown }[]): Disposable {
    return new Disposable();
  }
  dispose() {}
}

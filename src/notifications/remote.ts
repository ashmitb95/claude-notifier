import * as vscode from "vscode";

export function playRemoteSound(): void {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use the terminal bell instead — VS Code forwards BEL to the local client.
  // Ensure terminal bell is enabled in VS Code settings.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", {
    text: "",
  });
}

import { teardownHooks } from "./hooks/lifecycle";

// Invoked by VS Code's vscode:uninstall npm script when the extension is
// uninstalled. Runs as a standalone Node process (no extension host, no
// vscode module). Delegates to the shared teardown so the cleanup matches
// what setupHooks installs.
teardownHooks();

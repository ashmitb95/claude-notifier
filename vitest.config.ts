import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/hook/**/*.test.ts"],
    // Hook subprocess tests can take several seconds (waiting for sound to
    // finish or for spawn timeouts); raise the per-test ceiling.
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "hook/_lib/**/*.js"],
      exclude: ["src/extension.ts", "src/uninstall.ts"],
      reporter: ["text", "html"],
    },
    alias: {
      // vscode is provided by the extension host at runtime. In unit tests
      // we serve a minimal stub so modules that import it can be loaded
      // and exercised without spinning up @vscode/test-electron.
      vscode: path.resolve(__dirname, "test/_mocks/vscode.ts"),
    },
  },
});

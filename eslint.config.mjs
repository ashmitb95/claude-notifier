import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["out/**", "node_modules/**", "coverage/**", "*.vsix"],
  },
  js.configs.recommended,
  // TypeScript with type-aware rules — applies only to .ts files in the
  // tsconfig projects below. .js files (hook scripts) get a looser config
  // further down.
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Catches forgotten awaits — the main async-bug class strict TS misses.
      "@typescript-eslint/no-floating-promises": "error",
      // Async callback passed where sync expected.
      "@typescript-eslint/no-misused-promises": "error",

      // `settings.hooks?.[type]` etc. work on user-owned freeform JSON; we
      // type it as `any` deliberately so we don't pretend to validate a
      // schema we don't own. Disable the cascade of no-unsafe-* rules.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `let x = ""; try { x = ... } catch { return }` is intentional —
      // the catch needs the binding declared before the assignment so the
      // default-then-overwrite pattern is the cleanest way.
      "no-useless-assignment": "off",
    },
  },
  // Hook .js files — plain Node, no TypeScript project. Lint with the
  // non-type-aware base rules.
  {
    files: ["hook/**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        process: "readonly",
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  prettier
);

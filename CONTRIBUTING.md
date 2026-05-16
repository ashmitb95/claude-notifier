# Contributing

Issues, PRs, and questions all welcome.

## Dev setup

```bash
git clone https://github.com/ashmitb95/claude-notifier
cd claude-notifier
npm install
npm run compile
```

## Running locally

Open the repo in VS Code and press **F5** — launches an Extension Development Host window with the extension active. Use Claude Code in that window; the extension's hooks fire normally, and `View → Output → Claude Notifier` shows what's happening.

For a hands-off check, run the `/test-notifier` skill (if you have it installed) or the smoke script (`npm run smoke`).

## Gates

```bash
npm test               # unit + hook suites
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format:check   # prettier
npm run smoke          # builds the .vsix + drives synthetic hook events
```

CI runs all of these on Linux/macOS/Windows for every PR. Run them locally first.

## Code map

| Area | Files |
|---|---|
| Extension entry | `src/extension.ts` |
| Hook lifecycle in `~/.claude/settings.json` | `src/hooks/` |
| Signal pipeline (parse / dedup / dispatch) | `src/signals/` |
| Per-window cwd routing via PID markers | `src/routing/cwd.ts` |
| Notifications (sound, OS popup, terminal-notifier) | `src/notifications/` |
| Settings sync | `src/settings/` |
| Status bar + mute | `src/ui/status-bar.ts` |
| Output channel logger | `src/log.ts` |
| Hook scripts (run by Claude Code) | `hook/claude-notifier-on-*.{js,ps1}` |
| Shared hook library | `hook/_lib/*.js`, `hook/_lib.ps1` |
| Bundled fallback sounds | `media/sounds/*.wav` |

## Code style

Auto-formatted by Prettier — run `npm run format` before committing. ESLint enforces `no-floating-promises` and a few sanity rules; see `eslint.config.mjs`.

## PRs

- Target `main`.
- One fix/feature per PR.
- Commit prefix convention: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`, `refactor:`.
- PR template is auto-populated — please fill out the test plan.
- Test on the platform(s) you touched.

## Releases

Maintainer-driven and manual:

1. Bump `version` in `package.json`.
2. Prepend a release section to `CHANGELOG.md`.
3. `npm run package` produces the `.vsix`.
4. Tag (`git tag vX.Y.Z`), push, then `npx @vscode/vsce publish` from a checkout of the tagged commit.

## Reporting a bug

Use the bug report template. The `/test-notifier` skill's Diagnostics fault tree resolves a lot of "no sound" / "wrong sound" reports before they need to be filed.

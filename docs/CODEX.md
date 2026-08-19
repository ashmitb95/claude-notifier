# Codex support

Claude Notifier also notifies for [Codex](https://developers.openai.com/codex) sessions. Codex's
hook system is close enough to Claude Code's that both agents drive the same notification pipeline —
the same sounds, the same per-event levels, the same mute and auto-mute behaviour.

## How it works

On activation the extension writes its hook registration to `~/.codex/hooks.json` (or
`$CODEX_HOME/hooks.json`). The hooks it registers are the same scripts it installs for Claude Code,
in `~/.claude/hooks/`, invoked with `--agent codex` so notifications are worded correctly.

Everything downstream is shared: one signal file, one config file, one mute flag, one watcher,
regardless of how many agents are installed.

If you don't have Codex, nothing happens — no `~/.codex` directory is created. Set
`claudeNotifier.codex.enabled` to `false` to opt out even when Codex is present.

## Trusting the hooks

**Codex will not run a newly registered hook until you trust it.** After the extension writes
`hooks.json`, run `codex` in a terminal. It opens a **Hooks need review** screen at startup —
_"4 hooks are new or changed"_ — offering **Review hooks**, **Trust all and continue**, or
**Continue without trusting (hooks won't run)**. Approve, and notifications start firing.

Until you do, Codex sessions stay silent, and nothing surfaces the reason: the hooks parse cleanly,
`hooks/list` reports no warnings or errors, and Codex simply never invokes them. The registration
being present in `hooks.json` is not evidence that it runs — check `trustStatus`.

If `codex` isn't on your `PATH` — the common case when Codex arrived as the ChatGPT VS Code
extension rather than a standalone install — the CLI is bundled inside the extension:

```sh
export PATH="$(dirname "$(ls -d ~/.vscode/extensions/openai.chatgpt-*/bin/*/codex | head -1)")":$PATH
```

The terminal is only needed for this one approval; VS Code sessions pick the trust up afterwards.

Trust is recorded in `~/.codex/config.toml`, keyed by
`<hooks.json path>:<snake_case_event>:<groupIdx>:<hookIdx>` with no project component, so approving
once covers every project, and the Codex VS Code extension picks it up too. The terminal is the
place to grant it: the app-server protocol the VS Code extension speaks exposes only `hooks/list`,
with no method for granting trust. You can revisit the list later with `/hooks`, or under
`Tools & setup` → `Hooks`.

Trusted hooks run *outside* Codex's sandbox — its own review screen says so ("Hooks can run outside
the sandbox after you trust them"), which is what lets them play sounds. Codex's seatbelt sandbox
denies CoreAudio, so a sandboxed `afplay` fails with `AudioQueueStart failed (-66680)`; hooks are
not subject to that.

The extension does not grant that trust on your behalf. It could — trust is just a hash recorded in
`config.toml` — but that would defeat a control Codex added deliberately, and it would break the
moment OpenAI hardens it.

You only have to approve once. Codex pins trust to a hash of the *registration entry*, not of the
hook script's contents, so extension upgrades that change the scripts do not re-trigger the prompt.
The entry is deliberately kept byte-stable across releases for this reason — see the comment on
`hookCmd` in [`src/hooks/cmd.ts`](../src/hooks/cmd.ts).

Two things do invalidate trust and require re-approving:

- Changing `claudeNotifier.codex.enabled` off and on again in a release where the command line
  changed.
- Another tool inserting its own hooks *ahead* of ours in `hooks.json`, which shifts our index and
  therefore our trust key. We register ourselves first for each event to make this unlikely.

## Event coverage

| Notifier event | Claude Code | Codex |
| --- | --- | --- |
| `taskCompleted` | `Stop` | `Stop` |
| `needsPermission` | `PermissionRequest` | `PermissionRequest` |
| `subagentCompleted` | `SubagentStop` | `SubagentStop` |
| (internal staging) | `UserPromptSubmit` | `UserPromptSubmit` |
| `asksQuestion` | `PreToolUse` / `AskUserQuestion` | — no equivalent |

Codex has no `AskUserQuestion` tool, so the "asks a question" sound never fires for Codex sessions.
The setting still applies to Claude Code.

## Known limitations

- **Hooks run synchronously.** Codex waits for a command hook to exit; unlike its metadata model,
  the `hooks.json` format exposes no way to request async execution. Ours only write a signal file
  and return, and we register a 10-second timeout to bound the worst case.
- **Windows notifications say "Claude".** The PowerShell hook scripts don't read `--agent`. In
  practice Codex steers Windows users to WSL, which uses the Node scripts and labels correctly.
- **Notifier state lives under `~/.claude/hooks/`** even for Codex-only users, because that is where
  the shared signal file and config already live.

## Troubleshooting

`View → Output → Claude Notifier` logs whether the Codex registration was written.

To see what Codex itself makes of the registration — including trust status and any parse errors —
ask its app server directly. The `initialized` notification and short waits matter; without them,
`hooks/list` can come back empty even when the registration is valid:

```bash
{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"probe","version":"1"}}}'
  sleep 1
  printf '%s\n' '{"jsonrpc":"2.0","method":"initialized","params":{}}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwds":["/path/to/your/project"]}}'
  sleep 3; } | codex app-server
```

Each entry reports `trustStatus` (`trusted`, `untrusted`, or `modified`) and `timeoutSec`. A
`modified` status means the registration changed since you approved it and needs re-approving.

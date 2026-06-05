#!/bin/bash
# Claude Notifier — CLI installer
# Installs hooks for sound + notification when Claude finishes, needs permission, or asks a question.
# Works with Claude Code in terminal, vim, etc. No VSCode needed.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/install.sh | bash
#
# Uninstall:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash

set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
REPO_RAW="https://raw.githubusercontent.com/ashmitb95/claude-notifier/main"
REPO_API="https://api.github.com/repos/ashmitb95/claude-notifier/contents"

echo "Installing Claude Notifier..."

mkdir -p "$HOOKS_DIR" "$HOOKS_DIR/_lib"

for script in claude-notifier-on-stop.js claude-notifier-on-permission.js claude-notifier-on-question.js claude-notifier-on-prompt.js; do
  curl -fsSL "$REPO_RAW/hook/$script" -o "$HOOKS_DIR/$script"
  chmod +x "$HOOKS_DIR/$script"
done

# Shared hook library (required by the hook scripts since v3.0).
# Derive the file list from the repo so it can't drift as new _lib modules are added.
for lib in $(curl -fsSL "$REPO_API/hook/_lib?ref=main" | node -e "
let s = '';
process.stdin.on('data', d => (s += d)).on('end', () => {
  JSON.parse(s)
    .filter(e => e.type === 'file' && e.name.endsWith('.js'))
    .forEach(e => console.log(e.name));
});
"); do
  curl -fsSL "$REPO_RAW/hook/_lib/$lib" -o "$HOOKS_DIR/_lib/$lib"
done

# Bundled fallback sounds (played when the configured system sound is missing)
mkdir -p "$HOOKS_DIR/_lib/sounds"
for wav in task-complete.wav needs-input.wav question.wav; do
  curl -fsSL "$REPO_RAW/media/sounds/$wav" -o "$HOOKS_DIR/_lib/sounds/$wav"
done

if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

STOP_HOOK="$HOOKS_DIR/claude-notifier-on-stop.js"
PERM_HOOK="$HOOKS_DIR/claude-notifier-on-permission.js"
QUESTION_HOOK="$HOOKS_DIR/claude-notifier-on-question.js"
PROMPT_HOOK="$HOOKS_DIR/claude-notifier-on-prompt.js"

node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
if (!settings.hooks) settings.hooks = {};

// Clean stale entries from all hook types
for (const t of ['Stop', 'PermissionRequest', 'PreToolUse', 'Notification', 'UserPromptSubmit']) {
  if (settings.hooks[t]) {
    settings.hooks[t] = settings.hooks[t].filter(
      e => !e.hooks?.some(h => h.command?.includes('claude-notifier'))
    );
    if (settings.hooks[t].length === 0) delete settings.hooks[t];
  }
}

// Stop hook — task completed (Hero)
if (!settings.hooks.Stop) settings.hooks.Stop = [];
settings.hooks.Stop.push({
  hooks: [{ type: 'command', command: 'node \"$STOP_HOOK\"' }]
});

// PermissionRequest hook — needs permission (Glass)
if (!settings.hooks.PermissionRequest) settings.hooks.PermissionRequest = [];
settings.hooks.PermissionRequest.push({
  hooks: [{ type: 'command', command: 'node \"$PERM_HOOK\"' }]
});

// PreToolUse hook — question asked (Funk)
if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
settings.hooks.PreToolUse.push({
  matcher: 'AskUserQuestion',
  hooks: [{ type: 'command', command: 'node \"$QUESTION_HOOK\"' }]
});

// UserPromptSubmit hook — coordination only, no sound (advances stage dedup)
if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
settings.hooks.UserPromptSubmit.push({
  hooks: [{ type: 'command', command: 'node \"$PROMPT_HOOK\"' }]
});

fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
"

echo ""
echo "Done! Claude Notifier is installed."
echo ""
echo "  Three sounds:"
echo "    Glass  — Claude needs permission"
echo "    Funk   — Claude is asking a question"
echo "    Hero   — Claude finished the task"
echo ""
echo "  To mute:     touch ~/.claude/hooks/claude-notifier-muted"
echo "  To unmute:    rm ~/.claude/hooks/claude-notifier-muted"
echo "  To uninstall: curl -fsSL $REPO_RAW/uninstall.sh | bash"

#!/bin/bash
# Claude Notifier — CLI uninstaller
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ashmitb95/claude-notifier/main/uninstall.sh | bash

set -e

CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DIR/hooks"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

echo "Uninstalling Claude Notifier..."

rm -f "$HOOKS_DIR"/claude-notifier-on-*.js
rm -f "$HOOKS_DIR/claude-notifier-muted"
rm -f "$HOOKS_DIR/claude-signal"
rm -f "$HOOKS_DIR/claude-notifier-config.json"
rm -rf "$HOOKS_DIR/_lib"

if [ -f "$SETTINGS_FILE" ]; then
  node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));
for (const t of ['Stop', 'PermissionRequest', 'PreToolUse', 'Notification', 'UserPromptSubmit']) {
  if (settings.hooks?.[t]) {
    settings.hooks[t] = settings.hooks[t].filter(
      e => !e.hooks?.some(h => h.command?.includes('claude-notifier'))
    );
    if (settings.hooks[t].length === 0) delete settings.hooks[t];
  }
}
if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
"
fi

echo "Done! Claude Notifier has been removed."

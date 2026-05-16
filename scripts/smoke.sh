#!/usr/bin/env bash
# Agent-less pre-release sanity check. Builds the .vsix, drives each hook
# script with synthetic stdin in a throwaway HOME, and asserts the signal
# file content. Fails fast on any regression.
#
# Usage: npm run smoke
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

step() { yellow "→ $*"; }
pass() { green  "  ✓ $*"; }
fail() { red    "  ✗ $*"; exit 1; }

# 1. Compile + package
step "Building .vsix"
npm run compile > /dev/null
npm run package > /tmp/smoke-package.log 2>&1 || { cat /tmp/smoke-package.log; fail "vsce package failed"; }
VSIX="$(ls -t claude-notifier-*.vsix | head -1)"
[[ -f "$VSIX" ]] || fail ".vsix not produced"
pass "$VSIX produced"

# 2. Verify .vsix contents
step "Inspecting .vsix payload"
unzip -l "$VSIX" > /tmp/smoke-vsix.txt
for required in \
  "extension/package.json" \
  "extension/out/extension.js" \
  "extension/hook/claude-notifier-on-stop.js" \
  "extension/hook/claude-notifier-on-permission.js" \
  "extension/hook/claude-notifier-on-question.js" \
  "extension/hook/claude-notifier-on-prompt.js" \
  "extension/hook/_lib/sounds.js" \
  "extension/media/sounds/task-complete.wav"
do
  grep -qF "$required" /tmp/smoke-vsix.txt || fail "missing from .vsix: $required"
done
pass ".vsix contains all required files"

# 3. Drive hook scripts in a throwaway HOME
step "Smoke-testing hook scripts in a sandboxed HOME"
TMPHOME="$(mktemp -d -t claude-notifier-smoke-XXXXXX)"
trap 'rm -rf "$TMPHOME"' EXIT
mkdir -p "$TMPHOME/.claude/hooks"

# Absolute node path so the subprocess can still be launched after we
# scrub PATH (which suppresses afplay/paplay/notify-send/etc. in the hook
# itself — their failures land in the hook's try/catch and the signal
# write path still runs).
NODE_BIN="$(command -v node)"
[[ -x "$NODE_BIN" ]] || fail "node not on PATH"

run_hook() {
  local name="$1" stdin="$2"
  echo "$stdin" | HOME="$TMPHOME" PATH=/ "$NODE_BIN" "$REPO/hook/$name.js"
}

# Stop: expect "done <ts> <sid> <cwd>"
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-stop '{"session_id":"smoke","cwd":"/tmp/x"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ "$sig" =~ ^done\ [0-9]+\ smoke\ /tmp/x$ ]] || fail "stop signal wrong: $sig"
pass "stop hook: $sig"

# Permission: expect "input <ts> <sid>"
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-permission '{"tool_name":"Bash","session_id":"smoke"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ "$sig" =~ ^input\ [0-9]+\ smoke$ ]] || fail "permission signal wrong: $sig"
pass "permission hook: $sig"

# Permission with AskUserQuestion → must skip
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-permission '{"tool_name":"AskUserQuestion","session_id":"smoke"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ -z "$sig" ]] || fail "permission should skip AskUserQuestion (got: $sig)"
pass "permission skips AskUserQuestion"

# Question: expect "question <ts> <sid>"
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-question '{"tool_name":"AskUserQuestion","session_id":"smoke"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ "$sig" =~ ^question\ [0-9]+\ smoke$ ]] || fail "question signal wrong: $sig"
pass "question hook: $sig"

# Prompt: expect "prompt <ts> <sid>"
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-prompt '{"session_id":"smoke"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ "$sig" =~ ^prompt\ [0-9]+\ smoke$ ]] || fail "prompt signal wrong: $sig"
pass "prompt hook: $sig"

# Mute: stop hook should not write signal
touch "$TMPHOME/.claude/hooks/claude-notifier-muted"
> "$TMPHOME/.claude/hooks/claude-signal"
run_hook claude-notifier-on-stop '{"session_id":"smoke","cwd":"/tmp/x"}'
sig="$(cat "$TMPHOME/.claude/hooks/claude-signal" 2>/dev/null || echo '')"
[[ -z "$sig" ]] || fail "mute should short-circuit (got: $sig)"
pass "mute short-circuits"

echo
green "Smoke check passed."

// Detect whether this hook is running under a cmux-managed Claude session.
//
// cmux (com.cmuxterm.app) launches Claude through a wrapper that injects its
// own Stop / Notification / PermissionRequest hooks, which post cmux's native
// banners. When those are active, claude-notifier must not also play a sound or
// show a popup — that double-notifies the user. This is the same "defer to a
// host that has its own notifications" rule the Stop hook already applies for
// VS Code via extensionOwnsCwd().
//
// We gate on CMUX_CLAUDE_HOOK_CMUX_BIN specifically (not CMUX_BUNDLE_ID): the
// cmux wrapper exports it only after it has decided to inject its hooks, so its
// presence is an exact signal that cmux is posting its own notifications. A
// plain cmux pane with hooks disabled (CMUX_CLAUDE_HOOKS_DISABLED=1) leaves it
// unset, so claude-notifier still fires there.
//
// Only user-facing sound/popup output is gated; signal writing is unaffected.
function isInsideCmux() {
  return !!process.env.CMUX_CLAUDE_HOOK_CMUX_BIN;
}

module.exports = { isInsideCmux };

const DEFAULT_TITLE = "Claude Notifier";

/**
 * Notification title for a hook firing in `cwd` — the project directory's
 * leaf name, so parallel Claude sessions are distinguishable at a glance in
 * Notification Center / the Windows tray.
 *
 * Splits on both separators rather than using path.basename: a hook payload
 * carries the cwd style of the machine Claude runs on, which isn't always the
 * style of the machine formatting the notification (WSL, remote shells).
 * Falls back to "Claude Notifier" when there's no usable leaf (empty cwd, "/").
 */
function titleForCwd(cwd) {
  if (!cwd) return DEFAULT_TITLE;
  const parts = String(cwd)
    .split(/[\\/]+/)
    .filter(Boolean);
  return parts[parts.length - 1] || DEFAULT_TITLE;
}

module.exports = { titleForCwd, DEFAULT_TITLE };

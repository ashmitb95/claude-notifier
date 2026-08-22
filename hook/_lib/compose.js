const DEFAULT_TITLE = "Claude Notifier";

// Single-codepoint glyphs only. Variation-selector emoji such as ⚠️ are two
// codepoints and render inconsistently across platforms.
const EVENTS = {
  DONE: "✅ finished",
  PERMISSION: "❗ needs permission",
  QUESTION: "❓ question",
  SUBAGENT: "✅ subagent finished",
};

// Event labels are user-configurable free text, so they reach the banner
// unvalidated. Clamped to keep a pasted paragraph from running off the title.
const LABEL_MAX = 24;

// Measured on a macOS banner: ~40 chars per line, exactly four body lines.
const LINE = 40;
const BODY_LINES = 4;
const CHROME = 4; // "• " and " •"

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

/**
 * Assemble the banner. The frame cannot fix per-element caps independently of
 * content, so it allocates: the detail block takes the lines it needs and the
 * chat title claims whatever is left.
 *
 * Plain characters deliberately — Unicode maths-bold renders on macOS but
 * screen readers announce those codepoints as symbols and copied text stops
 * matching the real session name.
 */
function compose({ workspace, event, chatTitle, detail = [], fallback = "" } = {}) {
  const title = workspace ? (event ? `${workspace} | ${event}` : workspace) : DEFAULT_TITLE;

  const detailLines = detail.length ? detail : fallback ? [fallback] : [];
  const spare = Math.max(1, BODY_LINES - detailLines.length - (detailLines.length ? 1 : 0));
  const cap = spare * LINE - CHROME;

  const parts = [];
  if (chatTitle) parts.push(`• ${truncate(chatTitle, cap)} •`);
  if (detailLines.length) {
    if (parts.length) parts.push("");
    parts.push(...detailLines);
  }
  return { title, body: parts.join("\n") };
}

/**
 * The event label for a title: the user's configured string when they set one,
 * otherwise the built-in default from EVENTS. An empty string is a deliberate
 * opt-out and yields a workspace-only title, so it is distinct from unset.
 */
function eventLabel(configured, fallback) {
  if (configured === undefined || configured === null) return fallback;
  const flat = String(configured).replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > LABEL_MAX ? flat.slice(0, LABEL_MAX).trim() : flat;
}

/**
 * Whether the banner should carry the chat name and the detail block. Both
 * default on; an explicit false is the only thing that turns them off, so a
 * config written by an older extension keeps the current behaviour. Callers
 * check these *before* resolving, so an opt-out skips the transcript read
 * rather than discarding its result.
 */
function wantsChatTitle(config) {
  return !config || config.showChatTitle !== false;
}

function wantsDetail(config) {
  return !config || config.showDetail !== false;
}

/**
 * compose(), guarded. The resolvers read the filesystem and parse whatever
 * Claude Code happened to write, so an unforeseen throw is possible. Losing
 * the notification entirely would be worse than losing the detail, so any
 * failure degrades to the pre-rework banner: bare workspace title, plain
 * sentence. `build` returns { chatTitle, detail } and may throw freely.
 */
function safeCompose(workspace, event, fallback, build) {
  try {
    const { chatTitle, detail } = build() || {};
    return compose({ workspace, event, chatTitle, detail, fallback });
  } catch {
    return { title: workspace || DEFAULT_TITLE, body: fallback };
  }
}

module.exports = {
  compose,
  safeCompose,
  eventLabel,
  wantsChatTitle,
  wantsDetail,
  EVENTS,
  DEFAULT_TITLE,
};

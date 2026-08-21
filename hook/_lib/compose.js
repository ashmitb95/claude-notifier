const DEFAULT_TITLE = "Claude Notifier";

// Single-codepoint glyphs only. Variation-selector emoji such as ⚠️ are two
// codepoints and render inconsistently across platforms.
const EVENTS = {
  DONE: "✅ finished",
  PERMISSION: "❗ needs permission",
  QUESTION: "❓ question",
  SUBAGENT: "✅ subagent finished",
};

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
  const title = workspace ? `${workspace} | ${event}` : DEFAULT_TITLE;

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

module.exports = { compose, EVENTS, DEFAULT_TITLE };

// Mirror of hook/_lib/compose.js. The extension and the hooks are parallel
// implementations of the same notification frame — keep the two in sync.
export const DEFAULT_TITLE = "Claude Notifier";

// Single-codepoint glyphs only. Variation-selector emoji such as ⚠️ are two
// codepoints and render inconsistently across platforms.
export const EVENTS = {
  DONE: "✅ finished",
  PERMISSION: "❗ needs permission",
  QUESTION: "❓ question",
  SUBAGENT: "✅ subagent finished",
} as const;

// Measured on a macOS banner: ~40 chars per line, exactly four body lines.
const LINE = 40;
const BODY_LINES = 4;
const CHROME = 4; // "• " and " •"

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

export interface ComposeInput {
  workspace?: string;
  event: string;
  chatTitle?: string;
  detail?: string[];
  fallback?: string;
}

/**
 * Assemble the banner. The frame cannot fix per-element caps independently of
 * content, so it allocates: the detail block takes the lines it needs and the
 * chat title claims whatever is left.
 */
export function compose({
  workspace,
  event,
  chatTitle,
  detail = [],
  fallback = "",
}: ComposeInput): { title: string; body: string } {
  const title = workspace ? `${workspace} | ${event}` : DEFAULT_TITLE;

  const detailLines = detail.length ? detail : fallback ? [fallback] : [];
  const spare = Math.max(1, BODY_LINES - detailLines.length - (detailLines.length ? 1 : 0));
  const cap = spare * LINE - CHROME;

  const parts: string[] = [];
  if (chatTitle) parts.push(`• ${truncate(chatTitle, cap)} •`);
  if (detailLines.length) {
    if (parts.length) parts.push("");
    parts.push(...detailLines);
  }
  return { title, body: parts.join("\n") };
}

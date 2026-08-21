// Detail line(s) for the notification body, extracted from hook stdin.
// Everything here is pure — no file I/O. See _lib/activity.js for the one
// piece that does read the transcript.

const SENTENCE_MAX = 80;
const COMMAND_MAX = 60;

/** Strip markdown without mangling issue references like #94. */
function plain(text) {
  return String(text)
    .replace(/[*`]/g, "")
    .replace(/^#+\s/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The first sentence of the assistant's closing message, when it fits.
 * Returns "" if it does not — callers fall back to the activity summary
 * rather than showing a sentence sheared mid-clause.
 */
function doneDetail(lastAssistantMessage) {
  if (!lastAssistantMessage) return "";
  const flat = plain(lastAssistantMessage);
  if (!flat) return "";
  const first = flat.split(/(?<=[.!?])\s/)[0];
  return first.length <= SENTENCE_MAX ? first : "";
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut) + "…";
}

/**
 * The command permission is being asked for. permission_suggestions carries
 * Claude Code's own normalised form, which is shorter and more readable than
 * the raw compound command, so prefer it.
 */
function permissionDetail(input) {
  const tool = (input && input.tool_name) || "";
  const suggested =
    input &&
    Array.isArray(input.permission_suggestions) &&
    input.permission_suggestions
      .flatMap((s) => (s && Array.isArray(s.rules) ? s.rules : []))
      .map((r) => r && r.ruleContent)
      .find(Boolean);
  const raw = suggested || (input && input.tool_input && input.tool_input.command) || "";
  if (!raw) return "";
  const flat = String(raw).replace(/\s+/g, " ").trim();
  return tool ? `${tool}: ${truncate(flat, COMMAND_MAX)}` : truncate(flat, COMMAND_MAX);
}

/**
 * One question verbatim; two to four as a numbered list of their headers,
 * which the tool schema caps at 12 chars so they stay inside the line budget.
 */
function questionDetail(input) {
  const qs = input && input.tool_input && input.tool_input.questions;
  if (!Array.isArray(qs) || qs.length === 0) return "";
  if (qs.length === 1) return plain((qs[0] && qs[0].question) || "");
  return qs
    .map((q, i) => `${i + 1}. ${plain((q && q.header) || "")}`)
    .filter((line) => !line.endsWith(". "))
    .join("\n");
}

module.exports = { doneDetail, permissionDetail, questionDetail };

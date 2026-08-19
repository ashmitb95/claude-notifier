// Which agent invoked this hook. Registrations for agents other than Claude
// Code pass `--agent <id>`; a bare invocation is Claude Code.
const LABELS = { claude: "Claude", codex: "Codex" };

function agentId() {
  const i = process.argv.indexOf("--agent");
  const id = i >= 0 ? process.argv[i + 1] : "";
  return Object.prototype.hasOwnProperty.call(LABELS, id) ? id : "claude";
}

function agentLabel() {
  return LABELS[agentId()];
}

module.exports = { agentId, agentLabel };

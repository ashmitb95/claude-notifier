export interface ParsedSignal {
  reason: string;
  cwd: string;
}

/**
 * Signal format written by hook scripts:
 *   "<reason> <timestamp> <cwd...>"
 * cwd may contain spaces; older scripts may omit cwd or timestamp entirely.
 */
export function parseSignal(content: string): ParsedSignal {
  const firstSpace = content.indexOf(" ");
  const secondSpace = firstSpace >= 0 ? content.indexOf(" ", firstSpace + 1) : -1;
  const reason = firstSpace < 0 ? content : content.slice(0, firstSpace);
  const cwd = secondSpace >= 0 ? content.slice(secondSpace + 1) : "";
  return { reason, cwd };
}

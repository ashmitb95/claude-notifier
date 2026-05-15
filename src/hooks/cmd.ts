import { IS_WIN } from "../paths";

export function hookCmd(hookPath: string): string {
  if (IS_WIN) {
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
  }
  return `node "${hookPath}"`;
}

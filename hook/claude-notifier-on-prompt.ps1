# Claude Notifier - UserPromptSubmit hook (PowerShell)
# Signals the extension to advance the per-session stage when the user
# submits a new prompt. No sound, no notification — coordination only.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

Write-NotifierSignal -Reason 'prompt' -SessionId $data.session_id

exit 0

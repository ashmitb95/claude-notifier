# Claude Notifier - UserPromptSubmit hook (PowerShell)
# Signals the extension and records prompt-submit timestamp for the
# minTaskDurationThreshold feature.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

Write-NotifierSignal -Reason 'prompt' -SessionId $data.session_id
Save-NotifierTaskStart -SessionId $data.session_id

exit 0

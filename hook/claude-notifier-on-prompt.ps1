# Claude Notifier - UserPromptSubmit hook (PowerShell)
# Signals the extension and records prompt-submit timestamp for the
# minTaskDurationThreshold feature.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-NotifierDisabled) { exit 0 }

# A subagent handing its report back re-enters this hook mid-turn with the
# prompt_id already in flight. Advancing the stage there would reset the
# done-dedup and restart the threshold clock. Mirrors the JS hook.
$promptId = if ($data.prompt_id) { "$($data.prompt_id)" } else { '' }
if ($promptId -and (Get-NotifierPromptId $data.session_id) -eq $promptId) { exit 0 }

Write-NotifierSignal -Reason 'prompt' -SessionId $data.session_id
Save-NotifierTaskStart -SessionId $data.session_id -PromptId $promptId

exit 0

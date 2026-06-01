# Claude Notifier - PreToolUse hook for AskUserQuestion (PowerShell)
# Plays sound + shows notification when Claude asks the user a question.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

# Defense-in-depth: bail if a misconfigured matcher routes other tools here.
if ($data.tool_name -ne 'AskUserQuestion') { exit 0 }

if (Test-NotifierMuted) { exit 0 }

# Subagent-originated questions: silent exit when suppression is on (default).
$conf = Read-NotifierConfig
$suppressSubagent = if ($null -ne $conf.suppressSubagentInteractions) { [bool]$conf.suppressSubagentInteractions } else { $true }
if ($suppressSubagent -and $data.agent_id) { exit 0 }

$cfg = $conf.asksQuestion
$level = if ($cfg.level) { $cfg.level } else { 'sound+popup' }

if ($level -eq 'off') { exit 0 }

$threshold = if ($conf.minTaskDurationThreshold) { $conf.minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) {
    Write-NotifierSignal -Reason 'question' -SessionId $data.session_id
    exit 0
}

if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    $sound = Resolve-NotifierSound -Name $cfg.sound -Default 'C:\Windows\Media\Windows Notify.wav'
    Invoke-NotifierSound -Path $sound -Fallback $LibBundledFallback.asksQuestion
}

if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    Show-NotifierNotification -Message 'Claude is asking you a question.'
}

Write-NotifierSignal -Reason 'question' -SessionId $data.session_id

exit 0

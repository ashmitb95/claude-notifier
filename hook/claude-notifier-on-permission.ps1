# Claude Notifier - PermissionRequest hook (PowerShell)
# Plays sound + shows notification when Claude needs permission.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-NotifierMuted) { exit 0 }

# AskUserQuestion is handled by the separate PreToolUse question hook.
if ($data.tool_name -eq 'AskUserQuestion') { exit 0 }

# Subagent-originated permission requests: silent exit when suppression is on
# (default). agent_id is present only when the hook fires inside a subagent.
$conf = Read-NotifierConfig
$suppressSubagent = if ($null -ne $conf.suppressSubagentInteractions) { [bool]$conf.suppressSubagentInteractions } else { $true }
if ($suppressSubagent -and $data.agent_id) { exit 0 }

$cfg = $conf.needsPermission
$level = if ($cfg.level) { $cfg.level } else { 'sound+popup' }

if ($level -eq 'off') { exit 0 }

$threshold = if ($conf.minTaskDurationThreshold) { $conf.minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) {
    Write-NotifierSignal -Reason 'input' -SessionId $data.session_id
    exit 0
}

if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    $sound = Resolve-NotifierSound -Name $cfg.sound -Default 'C:\Windows\Media\Windows Notify.wav'
    Invoke-NotifierSound -Path $sound -Fallback $LibBundledFallback.needsPermission
}

if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    $tool = if ($data.tool_name) { $data.tool_name } else { 'a tool' }
    Show-NotifierNotification -Message "Claude needs permission to use $tool."
}

Write-NotifierSignal -Reason 'input' -SessionId $data.session_id

exit 0

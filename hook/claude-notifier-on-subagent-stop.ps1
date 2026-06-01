# Claude Notifier - SubagentStop hook (PowerShell)
# Fires when a Task subagent finishes. Default level is "off" so the hook
# is silent until the user opts in.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-NotifierMuted) { exit 0 }

$cwd = ""
if ($data.cwd) { $cwd = "$($data.cwd)" }
if (-not $cwd) { $cwd = (Get-Location).Path }

Write-NotifierSignal -Reason 'subagent_done' -SessionId $data.session_id -Cwd $cwd

if (Test-ExtensionOwnsCwd $cwd) { exit 0 }

$conf = Read-NotifierConfig
$cfg = $conf.subagentCompleted
$level = if ($cfg.level) { $cfg.level } else { 'off' }

if ($level -eq 'off') { exit 0 }

$threshold = if ($conf.minTaskDurationThreshold) { $conf.minTaskDurationThreshold } else { 0 }
if (Test-NotifierThresholdSuppress -SessionId $data.session_id -ThresholdSec $threshold) { exit 0 }

if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    $sound = Resolve-NotifierSound -Name $cfg.sound -Default 'C:\Windows\Media\notify.wav'
    Invoke-NotifierSound -Path $sound -Fallback $LibBundledFallback.taskCompleted
}

if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    Show-NotifierNotification -Message 'Claude subagent finished.'
}

exit 0

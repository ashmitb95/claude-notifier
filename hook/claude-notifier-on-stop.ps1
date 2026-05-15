# Claude Notifier - Stop hook (PowerShell)
# Writes a "done" signal for the VSCode extension to debounce. When no
# extension is active (terminal-only), plays sound/notification directly.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if ($data.stop_hook_active) { exit 0 }
if (Test-NotifierMuted) { exit 0 }

$cwd = ""
if ($data.cwd) { $cwd = "$($data.cwd)" }
if (-not $cwd) { $cwd = (Get-Location).Path }

Write-NotifierSignal -Reason 'done' -SessionId $data.session_id -Cwd $cwd

# If a VSCode window owns this cwd, the extension handles sound/notification
# with debounce. Otherwise fall through to direct playback.
if (Test-ExtensionOwnsCwd $cwd) { exit 0 }

$cfg = (Read-NotifierConfig).taskCompleted
$level = if ($cfg.level) { $cfg.level } else { 'sound+popup' }

if ($level -eq 'off') { exit 0 }

if ($level -eq 'sound+popup' -or $level -eq 'sound') {
    $sound = Resolve-NotifierSound -Name $cfg.sound -Default 'C:\Windows\Media\tada.wav'
    Invoke-NotifierSound -Path $sound -Fallback $LibBundledFallback.taskCompleted
}

if ($level -eq 'sound+popup' -or $level -eq 'popup') {
    Show-NotifierNotification -Message 'Claude has finished the task.'
}

exit 0

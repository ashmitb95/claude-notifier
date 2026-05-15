# Claude Notifier - PermissionRequest hook (PowerShell)
# Plays sound + shows notification when Claude needs permission.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-NotifierMuted) { exit 0 }

# AskUserQuestion is handled by the separate PreToolUse question hook.
if ($data.tool_name -eq 'AskUserQuestion') { exit 0 }

$cfg = (Read-NotifierConfig).needsPermission
$level = if ($cfg.level) { $cfg.level } else { 'sound+popup' }

if ($level -eq 'off') { exit 0 }

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

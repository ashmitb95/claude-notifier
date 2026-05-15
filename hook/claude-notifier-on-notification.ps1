# Claude Notifier - Notification hook (PowerShell)
# Plays sound + shows notification on permission_prompt notifications.
# Uses fixed sound (not config-driven).
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if ($data.notification_type -ne 'permission_prompt') { exit 0 }
if (Test-NotifierMuted) { exit 0 }

Invoke-NotifierSound -Path 'C:\Windows\Media\Windows Notify.wav' -Fallback $LibBundledFallback.needsPermission

$message = if ($data.message) { $data.message } else { 'Claude needs your permission.' }
Show-NotifierNotification -Message $message

Write-NotifierSignal -Reason 'input' -SessionId $data.session_id

exit 0

# Claude Notifier - Notification hook (PowerShell)
# Plays sound + shows notification on permission_prompt notifications.
# Uses fixed sound (not config-driven).
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_lib.ps1')

$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

if (Test-NotifierDisabled) { exit 0 }
if ($data.notification_type -ne 'permission_prompt') { exit 0 }
if (Test-NotifierMuted) { exit 0 }

Invoke-NotifierSound -Path 'C:\Windows\Media\Windows Notify.wav' -Fallback $LibBundledFallback.needsPermission

$message = if ($data.message) { $data.message } else { 'Claude needs your permission.' }
$conf = Read-NotifierConfig
$n = Get-NotifierComposed $data.cwd (Get-NotifierEventLabel $conf.needsPermission.label $LibEvents.Permission) $message {
    @{ ChatTitle = $(if (Test-NotifierWantsChatTitle $conf) { Get-NotifierChatTitle $data.transcript_path $data.session_id $data.cwd } else { '' })
       Detail    = @() }
}
Show-NotifierNotification -Message $n.Body -Title $n.Title

Write-NotifierSignal -Reason 'input' -SessionId $data.session_id

exit 0

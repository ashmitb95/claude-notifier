# Claude Notifier — shared PowerShell hook library.
# Dot-sourced by each hook: `. (Join-Path $PSScriptRoot '_lib.ps1')`.
$ErrorActionPreference = 'SilentlyContinue'

$LibHooksDir   = $PSScriptRoot
$LibMuteFlag   = Join-Path $LibHooksDir 'claude-notifier-muted'
$LibSignalFile = Join-Path $LibHooksDir 'claude-signal'
$LibConfigFile = Join-Path $LibHooksDir 'claude-notifier-config.json'
$LibActiveDir  = Join-Path $LibHooksDir 'claude-notifier-active.d'
$LibTaskStartDir = Join-Path $LibHooksDir 'claude-notifier-task-start'

# Bundled fallback sounds ship inside the .vsix at <ext>/media/sounds/ and
# setupHooks copies them to ~/.claude/hooks/_lib/sounds/. Invoke-NotifierSound
# uses them only when the primary path doesn't exist on disk.
$LibBundledSoundsDir = Join-Path $LibHooksDir '_lib\sounds'
$LibBundledFallback = @{
    taskCompleted   = Join-Path $LibBundledSoundsDir 'task-complete.wav'
    needsPermission = Join-Path $LibBundledSoundsDir 'needs-input.wav'
    asksQuestion    = Join-Path $LibBundledSoundsDir 'question.wav'
}

$LibWinSounds = @{
    'Windows Notify'     = 'C:\Windows\Media\Windows Notify.wav'
    'tada'               = 'C:\Windows\Media\tada.wav'
    'chimes'             = 'C:\Windows\Media\chimes.wav'
    'chord'              = 'C:\Windows\Media\chord.wav'
    'ding'               = 'C:\Windows\Media\ding.wav'
    'notify'             = 'C:\Windows\Media\notify.wav'
    'ringin'             = 'C:\Windows\Media\ringin.wav'
    'Windows Background' = 'C:\Windows\Media\Windows Background.wav'
}

# Resolve a sound preset name to a Windows .wav path. Falls back to $Default
# when the name is missing or unknown.
function Resolve-NotifierSound([string]$Name, [string]$Default) {
    if ($Name -and $LibWinSounds.ContainsKey($Name)) { return $LibWinSounds[$Name] }
    return $Default
}

# Read claude-notifier-config.json. Returns $null on any error.
function Read-NotifierConfig() {
    try { return (Get-Content $LibConfigFile -Raw) | ConvertFrom-Json } catch { return $null }
}

# Returns $true when the global mute flag is set.
function Test-NotifierMuted() {
    return (Test-Path $LibMuteFlag)
}

# Play a sound file synchronously. Falls back to $Fallback if $Path doesn't
# exist (e.g. user picked a sound that isn't installed); beeps if neither
# exists. Silently swallows errors — sound failure should never break a hook.
function Invoke-NotifierSound([string]$Path, [string]$Fallback) {
    $finalPath = if ($Path -and (Test-Path $Path)) {
        $Path
    } elseif ($Fallback -and (Test-Path $Fallback)) {
        $Fallback
    } else {
        $null
    }
    try {
        if ($finalPath) {
            (New-Object Media.SoundPlayer $finalPath).PlaySync()
        } else {
            [console]::Beep(800, 300)
        }
    } catch {}
}

# Show a Windows balloon notification (title is always "Claude Notifier").
function Show-NotifierNotification([string]$Message) {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, 'Claude Notifier', $Message, [System.Windows.Forms.ToolTipIcon]::None)
        Start-Sleep -Milliseconds 500
        $n.Dispose()
    } catch {}
}

# Write a signal for the extension.
# Format v2: "<reason> <ts> <session_id|-> [cwd]" (matches hook/_lib/signal.js).
# Session id is whitespace-stripped; "-" when absent.
function Write-NotifierSignal([string]$Reason, [string]$SessionId, [string]$Cwd) {
    try {
        $ts = (Get-Date -UFormat %s)
        $sid = if ($SessionId) { ($SessionId -replace '\s+', '') } else { '-' }
        if (-not $sid) { $sid = '-' }
        $payload = if ($Cwd) { "$Reason $ts $sid $Cwd" } else { "$Reason $ts $sid" }
        Set-Content -Path $LibSignalFile -Value $payload -NoNewline
    } catch {}
}

# True when $Cwd is inside $Folder (handles trailing separator equivalence).
function Test-CwdInsideFolder([string]$Cwd, [string]$Folder) {
    if (-not $Cwd -or -not $Folder) { return $false }
    if ($Cwd -eq $Folder) { return $true }
    $sep = [IO.Path]::DirectorySeparatorChar
    if (-not $Folder.EndsWith($sep)) { $Folder = $Folder + $sep }
    return $Cwd.StartsWith($Folder)
}

# True if any live extension window owns this cwd. Backwards-compat: empty
# marker file means a pre-cwd-routing extension is running — defer to it.
function Test-ExtensionOwnsCwd([string]$Cwd) {
    if (-not (Test-Path $LibActiveDir)) { return $false }
    foreach ($f in Get-ChildItem -Path $LibActiveDir -File -ErrorAction SilentlyContinue) {
        $pidVal = 0
        if (-not [int]::TryParse($f.Name, [ref]$pidVal)) { continue }
        if (-not (Get-Process -Id $pidVal -ErrorAction SilentlyContinue)) { continue }
        $folders = ""
        try { $folders = [IO.File]::ReadAllText($f.FullName) } catch {}
        if (-not $folders.Trim()) { return $true }
        foreach ($line in $folders -split "`n") {
            $folder = $line.Trim()
            if ($folder -and (Test-CwdInsideFolder $Cwd $folder)) { return $true }
        }
    }
    return $false
}

# Sanitize a session id into a filename-safe slug. Mirrors safeSessionId() in
# src/signals/task-timer.ts and hook/_lib/task-timer.js: strips non-alphanumeric
# characters then collapses consecutive dots, falling back to __anon__.
function Get-NotifierSafeSessionId([string]$SessionId) {
    if (-not $SessionId) { return '__anon__' }
    $cleaned = ($SessionId -replace '[^A-Za-z0-9._-]', '')
    $cleaned = ($cleaned -replace '\.{2,}', '')
    if (-not $cleaned) { return '__anon__' }
    return $cleaned
}

function Get-NotifierMarkerPath([string]$SessionId) {
    $sid = Get-NotifierSafeSessionId $SessionId
    return Join-Path $LibTaskStartDir ($sid + '.json')
}

# Write the per-session task-start marker. Called from the UserPromptSubmit
# hook. Best-effort — failure must never break the hook.
function Save-NotifierTaskStart([string]$SessionId) {
    try {
        if (-not (Test-Path $LibTaskStartDir)) {
            New-Item -ItemType Directory -Path $LibTaskStartDir -Force | Out-Null
        }
        $sid = Get-NotifierSafeSessionId $SessionId
        $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
        $payload = @{ startedAt = $now; sessionId = $sid } | ConvertTo-Json -Compress
        Set-Content -Path (Get-NotifierMarkerPath $SessionId) -Value $payload -NoNewline
    } catch {}
}

function Get-NotifierTaskStartedAt([string]$SessionId) {
    try {
        $raw = Get-Content (Get-NotifierMarkerPath $SessionId) -Raw -ErrorAction Stop
        $obj = $raw | ConvertFrom-Json
        if ($null -ne $obj -and $null -ne $obj.startedAt) {
            return [int64]$obj.startedAt
        }
        return $null
    } catch { return $null }
}

# Returns $true when the session's task started less than $ThresholdSec ago.
# Mirrors shouldSuppressForThreshold() on the JS side. Fails open when the
# marker is missing or unreadable.
function Test-NotifierThresholdSuppress([string]$SessionId, $ThresholdSec) {
    $t = 0.0
    try { $t = [double]$ThresholdSec } catch { return $false }
    if ($t -le 0) { return $false }
    $started = Get-NotifierTaskStartedAt $SessionId
    if ($null -eq $started) { return $false }
    $now = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    return (($now - $started) -lt ($t * 1000))
}

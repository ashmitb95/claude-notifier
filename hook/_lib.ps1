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

# Per-session opt-out: set CLAUDE_NOTIFIER_DISABLE in the shell to silence all
# hook output (sound, popup, and signal) for that session only. Unlike the
# machine-wide mute flag, this is scoped to the process environment, so a user
# on a shared host can disable just their own sessions. Any non-empty value
# other than "0"/"false" counts as disabled.
function Test-NotifierDisabled() {
    $v = $env:CLAUDE_NOTIFIER_DISABLE
    if (-not $v) { return $false }
    if ($v -eq '0' -or $v.ToLower() -eq 'false') { return $false }
    return $true
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

# Notification title for a hook firing in $Cwd — the project directory's leaf
# name, so parallel Claude sessions are distinguishable at a glance in the
# tray. Mirrors titleForCwd in hook/_lib/title.js. Falls back to
# "Claude Notifier" when there's no usable leaf.
function Get-NotifierTitle([string]$Cwd) {
    if (-not $Cwd) { return 'Claude Notifier' }
    $leaf = @($Cwd -split '[\\/]+' | Where-Object { $_ }) | Select-Object -Last 1
    if ($leaf) { return $leaf }
    return 'Claude Notifier'
}

# Event labels for the notification title. Mirrors EVENTS in
# hook/_lib/compose.js. Keep the two in sync.
$LibEvents = @{
    Done       = [char]0x2705 + ' finished'
    Permission = [char]0x2757 + ' needs permission'
    Question   = [char]0x2753 + ' question'
    Subagent   = [char]0x2705 + ' subagent finished'
}

# Notification title: "<workspace> | <emoji> <event>". Mirrors compose() in
# hook/_lib/compose.js.
function Get-NotifierEventTitle([string]$Cwd, [string]$Event) {
    $ws = Get-NotifierTitle $Cwd
    if (-not $ws) { return 'Claude Notifier' }
    return "$ws | $Event"
}

# The chat title for a session, or '' when none resolves. Mirrors sessionTitle()
# in hook/_lib/session-label.js: custom-title beats ai-title beats the first
# non-injected user message, all read from the head of the transcript.
function Get-NotifierChatTitle([string]$TranscriptPath, [string]$SessionId, [string]$Cwd) {
    $file = $TranscriptPath
    if (-not ($file -and (Test-Path $file))) {
        if (-not $SessionId -or $SessionId -eq '-') { return '' }
        $projects = Join-Path $HOME '.claude\projects'
        $slug = '-' + (@($Cwd -split '[\\/]+' | Where-Object { $_ }) -join '-')
        $guess = Join-Path (Join-Path $projects $slug) "$SessionId.jsonl"
        if (Test-Path $guess) {
            $file = $guess
        } else {
            foreach ($dir in Get-ChildItem -Path $projects -Directory -ErrorAction SilentlyContinue) {
                $candidate = Join-Path $dir.FullName "$SessionId.jsonl"
                if (Test-Path $candidate) { $file = $candidate; break }
            }
        }
    }
    if (-not ($file -and (Test-Path $file))) { return '' }

    # ai-title and custom-title are written near the start of a transcript while
    # transcripts reach tens of MB, so only the first lines are read.
    $lines = Get-Content -Path $file -TotalCount 400 -ErrorAction SilentlyContinue
    if (-not $lines) { return '' }
    $recs = @()
    foreach ($line in $lines) {
        if (-not $line) { continue }
        try { $recs += ($line | ConvertFrom-Json) } catch {}
    }

    $title = ''
    for ($i = $recs.Count - 1; $i -ge 0; $i--) {
        if ($recs[$i].type -eq 'custom-title' -and $recs[$i].customTitle) { $title = $recs[$i].customTitle; break }
    }
    if (-not $title) {
        for ($i = $recs.Count - 1; $i -ge 0; $i--) {
            if ($recs[$i].type -eq 'ai-title' -and $recs[$i].aiTitle) { $title = $recs[$i].aiTitle; break }
        }
    }
    if (-not $title) {
        # A session too young to have been titled yet.
        foreach ($rec in $recs) {
            if ($rec.type -ne 'user' -or -not $rec.message) { continue }
            $c = $rec.message.content
            $t = if ($c -is [string]) { $c } else { ($c | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text }
            # Skip injected <system-reminder> / <ide_selection> turns.
            if ($t -and -not $t.TrimStart().StartsWith('<')) { $title = $t; break }
        }
    }
    if (-not $title) { return '' }
    $title = ($title -replace '\s+', ' ').Trim()
    if ($title.Length -gt 70) { $title = $title.Substring(0, 69) + [char]0x2026 }
    return $title
}

# Mirrors truncate() in hook/_lib/compose.js: prefer breaking on a word
# boundary, but only when that doesn't throw away more than half the budget.
function Get-NotifierTruncated([string]$Text, [int]$Max) {
    if (-not $Text -or $Text.Length -le $Max) { return $Text }
    $cut = $Text.Substring(0, $Max - 1)
    $space = $cut.LastIndexOf(' ')
    if ($space -gt ($Max / 2)) { $cut = $cut.Substring(0, $space) }
    return $cut + [char]0x2026
}

# Mirrors permissionDetail() in hook/_lib/detail.js. permission_suggestions
# carries Claude Code's own normalised form, which is shorter and more readable
# than the raw compound command, so prefer it.
function Get-NotifierPermissionDetail($Data) {
    $tool = $Data.tool_name
    $raw = ''
    if ($Data.permission_suggestions) {
        foreach ($s in @($Data.permission_suggestions)) {
            foreach ($r in @($s.rules)) {
                if ($r.ruleContent) { $raw = $r.ruleContent; break }
            }
            if ($raw) { break }
        }
    }
    if (-not $raw -and $Data.tool_input) { $raw = $Data.tool_input.command }
    if (-not $raw) { return '' }
    $flat = Get-NotifierTruncated (($raw -replace '\s+', ' ').Trim()) 60
    if ($tool) { return "${tool}: $flat" }
    return $flat
}

# Mirrors questionDetail() in hook/_lib/detail.js. One question verbatim; two
# to four as a numbered list of their headers.
function Get-NotifierQuestionDetail($Data) {
    $qs = @()
    if ($Data.tool_input) { $qs = @($Data.tool_input.questions) }
    $qs = @($qs | Where-Object { $_ })
    if ($qs.Count -eq 0) { return @() }
    if ($qs.Count -eq 1) { return @((($qs[0].question -replace '[*`]', '') -replace '\s+', ' ').Trim()) }
    $out = @()
    for ($i = 0; $i -lt $qs.Count; $i++) {
        $h = (($qs[$i].header -replace '[*`]', '') -replace '\s+', ' ').Trim()
        if ($h) { $out += "$($i + 1). $h" }
    }
    return $out
}

# Mirrors doneDetail() in hook/_lib/detail.js: the first sentence of the
# assistant's closing message, but only when it fits — a sentence sheared
# mid-clause is worse than the generic fallback.
function Get-NotifierDoneDetail([string]$LastAssistantMessage) {
    if (-not $LastAssistantMessage) { return @() }
    $flat = ((($LastAssistantMessage -replace '[*`]', '') -replace '(?m)^#+\s', '') -replace '\s+', ' ').Trim()
    if (-not $flat) { return @() }
    $first = ([regex]::Split($flat, '(?<=[.!?])\s'))[0]
    if ($first.Length -le 80) { return @($first) }
    return @()
}

# Mirrors compose() in hook/_lib/compose.js. Keep the two in sync.
#
# NOTE: the JS side falls back to activitySummary() (a transcript tail read)
# when doneDetail() comes up empty. That fallback is not mirrored here — there
# is no PowerShell test coverage in this repo, so a second JSONL reader on the
# Windows path is not worth the risk. Windows done notifications get the chat
# title plus either the closing sentence or the generic line.
function Get-NotifierBody([string]$ChatTitle, [string[]]$Detail, [string]$Fallback) {
    $lines = @()
    $detailLines = if ($Detail -and $Detail.Count -gt 0) { $Detail } elseif ($Fallback) { @($Fallback) } else { @() }
    $spare = [Math]::Max(1, 4 - $detailLines.Count - $(if ($detailLines.Count -gt 0) { 1 } else { 0 }))
    $cap = $spare * 40 - 4
    if ($ChatTitle) {
        $lines += "$([char]0x2022) $(Get-NotifierTruncated $ChatTitle $cap) $([char]0x2022)"
    }
    if ($detailLines.Count -gt 0) {
        if ($lines.Count -gt 0) { $lines += "" }
        $lines += $detailLines
    }
    return ($lines -join "`n")
}

# Show a Windows balloon notification. Pass -Title (see Get-NotifierTitle) to
# label it with the project; defaults to "Claude Notifier".
function Show-NotifierNotification([string]$Message, [string]$Title = 'Claude Notifier') {
    try {
        if (-not $Title) { $Title = 'Claude Notifier' }
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, $Title, $Message, [System.Windows.Forms.ToolTipIcon]::None)
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
# On Windows, paths are case-insensitive — normalize to lowercase for parity
# with cwdMatchesFolder() in src/routing/cwd.ts.
function Test-CwdInsideFolder([string]$Cwd, [string]$Folder) {
    if (-not $Cwd -or -not $Folder) { return $false }
    $isWindows = [IO.Path]::DirectorySeparatorChar -eq '\'
    if ($isWindows) { $Cwd = $Cwd.ToLower(); $Folder = $Folder.ToLower() }
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

# speak.ps1 -- talk-to-me skill: say a phrase out loud via ElevenLabs (voice: ELEVENLABS_VOICE_ID, model v3)
# Usage: powershell -File speak.ps1 -TextFile C:\path\to\utf8.txt      (preferred: no encoding risk)
#        powershell -File speak.ps1 -Text "Listo, ya quedo el deploy."
#
# Windows only: playback uses WPF MediaPlayer (PresentationCore) and the optional offline
# fallback uses System.Speech. Runs on Windows PowerShell 5.1 or PowerShell 7 on Windows.
#
# NOTE: normally you do NOT call this directly. Use ttm.py (notify / say) so the camera gate
# and the shared cross-session queue are respected. This script is the raw TTS leg.
#
# Contract: prints a single "spoken:<engine>" line and exits 0 ONLY when audio was generated
# AND verifiably played. Anything else exits non-zero with no spoken: line, because ttm.py
# deletes the operator's messages on the strength of that line alone.
param(
    [string]$Text,
    [string]$TextFile,
    [string]$VoiceId,
    [string]$ModelId
)

$ErrorActionPreference = 'Stop'

# --- text: file wins over inline (UTF-8 safe for accents) ---
if ($TextFile) {
    if (-not (Test-Path $TextFile)) { Write-Error "TextFile not found: $TextFile"; exit 2 }
    $Text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
}
if ([string]::IsNullOrWhiteSpace($Text)) { Write-Error 'No text supplied (-Text or -TextFile)'; exit 2 }

# --- central store (same rule as ttm.py: TTM_HOME, else ~/.claude/talk-to-me) ---
$store = if ($env:TTM_HOME) { $env:TTM_HOME } else { Join-Path $env:USERPROFILE '.claude\talk-to-me' }

# --- settings: process env > skill-local .env > store .env (values are never printed) ---
$envFiles = @((Join-Path $PSScriptRoot '..\.env'), (Join-Path $store '.env'))
function Get-Setting([string]$name) {
    $v = [Environment]::GetEnvironmentVariable($name)
    if ($v) { return $v.Trim() }
    foreach ($f in $envFiles) {
        if (-not (Test-Path $f)) { continue }
        $line = Select-String -Path $f -Pattern ('^\s*' + [regex]::Escape($name) + '\s*=') | Select-Object -First 1
        if ($line) {
            $val = ($line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")
            if ($val) { return $val }
        }
    }
    return $null
}

# --- config.json in the store: fallback for voice/model, and the SAPI switch ---
$cfgPath = Join-Path $store 'config.json'
$cfg = $null
if (Test-Path $cfgPath) {
    try { $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $cfg = $null }
}
if (-not $VoiceId) { $VoiceId = Get-Setting 'ELEVENLABS_VOICE_ID' }
if (-not $VoiceId -and $cfg -and $cfg.voice_id) { $VoiceId = $cfg.voice_id }
if (-not $ModelId) { $ModelId = Get-Setting 'ELEVENLABS_MODEL_ID' }
if (-not $ModelId) { $ModelId = if ($cfg -and $cfg.model_id) { $cfg.model_id } else { 'eleven_v3' } }
$allowSapi = $false
if ($cfg -and $null -ne $cfg.allow_sapi_fallback) { $allowSapi = [bool]$cfg.allow_sapi_fallback }

$key = Get-Setting 'ELEVENLABS_API_KEY'
if (-not $key) { Write-Error 'No ELEVENLABS_API_KEY found (env var, skill .env, or store .env)'; exit 1 }
if (-not $VoiceId) { Write-Error 'No ELEVENLABS_VOICE_ID found (env var, skill .env, store .env, or voice_id in config.json)'; exit 1 }

$outFile = Join-Path $env:TEMP ("talk-to-me-{0}.mp3" -f ([guid]::NewGuid().ToString('N').Substring(0, 8)))
$timeoutSec = [int](25 + $Text.Length / 12)

function Invoke-Tts([string]$model) {
    $body = @{ text = $Text; model_id = $model } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-RestMethod -Method Post `
        -Uri "https://api.elevenlabs.io/v1/text-to-speech/$VoiceId`?output_format=mp3_44100_128" `
        -Headers @{ 'xi-api-key' = $key; 'Content-Type' = 'application/json' } `
        -Body $bytes -TimeoutSec $timeoutSec -OutFile $outFile
}

function Get-HttpStatus($errorRecord) {
    try { return [int]$errorRecord.Exception.Response.StatusCode } catch { return 0 }
}

try {
    # ---------------------------------------------------------------- generate audio
    $engine = $null
    $ttsError = ''
    try {
        Invoke-Tts $ModelId
        $engine = $ModelId
    } catch {
        $status = Get-HttpStatus $_
        $ttsError = "$ModelId -> HTTP $status : $($_.Exception.Message)"
        # Retry ONLY when the server rejected the model itself. On 401/403/429 a retry
        # cannot succeed, and on a client-side timeout (status 0) the request may already
        # have been generated and billed -- re-sending would charge the operator twice.
        $retryable = ($status -eq 400 -or $status -eq 422 -or ($status -ge 500 -and $status -lt 600))
        if ($retryable) {
            try {
                Invoke-Tts 'eleven_multilingual_v2'
                $engine = 'eleven_multilingual_v2'
                $ttsError = ''
            } catch {
                $ttsError += " | multilingual_v2 -> HTTP $(Get-HttpStatus $_) : $($_.Exception.Message)"
            }
        }
    }

    $haveAudio = $engine -and (Test-Path $outFile) -and ((Get-Item $outFile).Length -gt 0)

    # ------------------------------------------------------------------ play and verify
    if ($haveAudio) {
        Add-Type -AssemblyName PresentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $script:mediaFailed = $false
        $null = $player.add_MediaFailed({ $script:mediaFailed = $true })
        try {
            $player.Volume = 1.0
            $player.Open([Uri]$outFile)

            # A decoder that never resolves a duration means the audio endpoint could not
            # be opened -- common when the default output device changes or disappears
            # (headset unplugged, dock or monitor switched).
            $t0 = Get-Date
            while (-not $player.NaturalDuration.HasTimeSpan -and -not $script:mediaFailed `
                   -and ((Get-Date) - $t0).TotalSeconds -lt 6) {
                Start-Sleep -Milliseconds 100
            }
            if ($script:mediaFailed -or -not $player.NaturalDuration.HasTimeSpan) {
                Write-Error "audio opened no output device (no duration after 6s)"
                exit 1
            }

            $dur = $player.NaturalDuration.TimeSpan
            $player.Play()

            # the transport clock must actually start moving; a silent no-op leaves it at 0
            $t1 = Get-Date
            while ($player.Position -le [TimeSpan]::Zero -and -not $script:mediaFailed `
                   -and ((Get-Date) - $t1).TotalSeconds -lt 5) {
                Start-Sleep -Milliseconds 100
            }
            if ($player.Position -le [TimeSpan]::Zero -or $script:mediaFailed) {
                Write-Error "playback never started (position stayed at zero)"
                exit 1
            }

            $deadline = (Get-Date).AddSeconds($dur.TotalSeconds + 5)
            while ((Get-Date) -lt $deadline -and -not $script:mediaFailed) {
                Start-Sleep -Milliseconds 200
                if ($player.Position -ge $dur) { break }
            }
            if ($script:mediaFailed) { Write-Error 'playback failed mid-clip'; exit 1 }

            Write-Output "spoken:elevenlabs:$engine"
            exit 0
        } finally {
            try { $player.Close() } catch { }
        }
    }

    # ------------------------------------------------------- offline fallback (opt-in)
    # Many Windows installs only ship en-US SAPI voices, so reading an announcement in
    # another language through SAPI is a degraded delivery, not a success. ttm.py keeps
    # the items queued unless allow_sapi_fallback is switched on.
    if (-not $allowSapi) {
        Write-Error "ElevenLabs failed and SAPI fallback is disabled. $ttsError"
        exit 1
    }
    try {
        Add-Type -AssemblyName System.Speech
        $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $sapi.Speak($Text)
        Write-Output 'spoken:sapi-fallback'
        exit 0
    } catch {
        Write-Error "TTS failed on every engine. $ttsError | SAPI: $($_.Exception.Message)"
        exit 1
    }
} finally {
    if (Test-Path $outFile) { Remove-Item $outFile -Force -ErrorAction SilentlyContinue }
}

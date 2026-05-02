param(
    [switch]$Docker
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-PythonCommand {
    $candidates = @(
        (Join-Path $root ".venv\Scripts\python.exe"),
        (Join-Path $root "venv\Scripts\python.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    throw "Python was not found. Install Python or create a local virtualenv first."
}

function Resolve-PnpmCommand {
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    }

    if (-not $pnpm) {
        throw "pnpm was not found. Install pnpm (or enable Corepack) before running start.ps1."
    }

    return $pnpm.Source
}

if ($Docker) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $docker) {
        throw "Docker is not installed or not available in PATH."
    }

    Push-Location $root
    try {
        docker compose up
    }
    finally {
        Pop-Location
    }

    exit 0
}

$pythonCommand = Resolve-PythonCommand
$pnpmCommand = Resolve-PnpmCommand

$logDir = Join-Path $root "data"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$backendCommand = "& '$pythonCommand' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
$bridgeLog = Join-Path $logDir "mqtt_bridge.log"
$bridgeCommand = "& '$pythonCommand' -u scripts\mqtt_to_api.py *> '$bridgeLog'"
$frontendCommand = "$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:8000/api'; & '$pnpmCommand' dev --hostname 0.0.0.0 --port 3000"

Start-Process `
    -FilePath "powershell.exe" `
    -WorkingDirectory $root `
    -WindowStyle Normal `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "`$Host.UI.RawUI.WindowTitle='NRTF Backend'; $backendCommand"
    )

Start-Sleep -Seconds 2

Start-Process `
    -FilePath "powershell.exe" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -ArgumentList @(
        "-ExecutionPolicy", "Bypass",
        "-Command", "`$Host.UI.RawUI.WindowTitle='NRTF MQTT Bridge'; $bridgeCommand"
    )

Start-Sleep -Seconds 1

Start-Process `
    -FilePath "powershell.exe" `
    -WorkingDirectory $root `
    -WindowStyle Normal `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "`$Host.UI.RawUI.WindowTitle='NRTF Frontend'; $frontendCommand"
    )

Write-Host "Backend starting on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "MQTT bridge logging to $bridgeLog" -ForegroundColor Green
Write-Host "Frontend starting on http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "Use .\\start.ps1 -Docker to run the same app through docker compose." -ForegroundColor Cyan

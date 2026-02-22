# webcode One-Command Installer for Windows
# https://github.com/land007/webcode

$ErrorActionPreference = "Stop"

# Colors
function Get-Color {
    param([string]$Name)
    $colors = @{
        Cyan    = [ConsoleColor]::Cyan
        Green   = [ConsoleColor]::Green
        Yellow  = [ConsoleColor]::Yellow
        Red     = [ConsoleColor]::Red
        Blue    = [ConsoleColor]::Blue
    }
    return $colors[$Name]
}

# Configuration
$RepoUrl = "https://github.com/land007/webcode"
$DockerComposeUrl = "https://raw.githubusercontent.com/land007/webcode/main/launcher/assets/docker-compose.yml"
$InstallDir = "$env:USERPROFILE\webcode"

#############################################
# Helper Functions
#############################################

function Print-Logo {
    Write-Host @"
   __                    __              __
  / /____  __  _______  / /_____  ____  / /___ _
 / __/ _ \/ / / / ___/ / __/ __ \/ __ \/ / __ `/
/ /_/  __/ /_/ / /    / /_/ /_/ / /_/ / / /_/ /
\__/\___/\__,_/_/     \__/\____/\____/_/\__,_/

One-command browser-based dev environment installer
"@
    Write-Host ""
}

function Print-Header {
    param([string]$Message)
    Write-Host "▸ $Message" -ForegroundColor Cyan
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "  → $Message" -ForegroundColor Blue
}

function Test-DockerInstalled {
    try {
        $null = Get-Command docker -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Test-DockerRunning {
    try {
        $null = docker version 2>&1
        return $true
    } catch {
        return $false
    }
}

function Test-DockerCompose {
    try {
        $null = docker compose version 2>&1
        return $true
    } catch {
        return $false
    }
}

function Install-DockerMode {
    Print-Header "Installing webcode (Docker mode)..."

    # Create install directory
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    Set-Location $InstallDir

    # Download docker-compose.yml
    Print-Info "Downloading docker-compose.yml..."
    try {
        Invoke-WebRequest -Uri $DockerComposeUrl -OutFile "docker-compose.yml" -UseBasicParsing
        Print-Success "Downloaded docker-compose.yml"
    } catch {
        Print-Error "Failed to download docker-compose.yml"
        Print-Info "Check your internet connection and try again."
        exit 1
    }

    # Ask for custom credentials
    Write-Host ""
    Write-Host "Customize credentials? [y/N]: " -NoNewline -ForegroundColor Yellow
    $customize = Read-Host
    if ($customize -eq 'y' -or $customize -eq 'Y') {
        $authUser = Read-Host "Basic Auth username [admin]"
        if ([string]::IsNullOrWhiteSpace($authUser)) { $authUser = "admin" }

        $authPassword = Read-Host "Basic Auth password [changeme]"
        if ([string]::IsNullOrWhiteSpace($authPassword)) { $authPassword = "changeme" }

        $vncPassword = Read-Host "VNC password [changeme]"
        if ([string]::IsNullOrWhiteSpace($vncPassword)) { $vncPassword = "changeme" }

        # Create .env file
        @"
AUTH_USER=$authUser
AUTH_PASSWORD=$authPassword
VNC_PASSWORD=$vncPassword
"@ | Out-File -FilePath ".env" -Encoding UTF8
        Print-Success "Created .env with custom credentials"
    } else {
        Print-Info "Using default credentials (admin/changeme)"
    }

    # Start container
    Write-Host ""
    Print-Header "Starting container..."
    try {
        docker compose up -d
        Print-Success "Container started successfully"
    } catch {
        Print-Error "Failed to start container"
        exit 1
    }

    # Wait for services to be ready
    Print-Info "Waiting for services to start..."
    Start-Sleep -Seconds 5

    Print-Success "Installation complete!"
}

function Print-CompletionInfo {
    Write-Host ""
    Print-Header "═══════════════════════════════════════════════════════════════"
    Print-Success "webcode is ready!"
    Print-Header "═══════════════════════════════════════════════════════════════"
    Write-Host ""
    Print-Header "Access Points:"
    Write-Host ""
    Write-Host "  Theia IDE        http://localhost:20001"
    Write-Host "  Vibe Kanban      http://localhost:20002"
    Write-Host "  OpenClaw AI      http://localhost:20003"
    Write-Host "  noVNC Desktop    http://localhost:20004"
    Write-Host "  VNC Client       localhost:20005"
    Write-Host ""
    Print-Header "Default Credentials:"
    Write-Host "  Basic Auth: " -NoNewline
    Write-Host "admin / changeme" -ForegroundColor Green
    Write-Host "  VNC Password: " -NoNewline
    Write-Host "changeme" -ForegroundColor Green
    Write-Host ""
    Print-Header "Common Commands:"
    Print-Info "View status:    cd $InstallDir; docker compose ps"
    Print-Info "View logs:      cd $InstallDir; docker compose logs -f"
    Print-Info "Stop:           cd $InstallDir; docker compose down"
    Print-Info "Restart:        cd $InstallDir; docker compose restart"
    Write-Host ""
    Print-Header "Documentation:"
    Print-Info "GitHub:  $RepoUrl"
    Print-Info "Docker:  https://hub.docker.com/r/land007/webcode"
    Write-Host ""
}

#############################################
# Main Flow
#############################################

function Main {
    Print-Logo

    Print-Info "Detected OS: Windows"

    Write-Host ""
    Print-Header "Checking prerequisites..."
    Write-Host ""

    # Check Docker
    if (-not (Test-DockerInstalled)) {
        Print-Error "Docker is not installed"
        Write-Host ""
        Print-Header "Install Docker Desktop:"
        Print-Info "Visit: https://www.docker.com/products/docker-desktop"
        Write-Host "  Download and install Docker Desktop for Windows, then run this script again."
        exit 1
    }
    Print-Success "Docker is installed"

    # Check if Docker is running
    if (-not (Test-DockerRunning)) {
        Print-Error "Docker is not running"
        Print-Info "Please start Docker Desktop and try again."
        exit 1
    }
    Print-Success "Docker is running"

    # Check Docker Compose
    if (-not (Test-DockerCompose)) {
        Print-Error "docker compose is not available"
        Print-Info "Please install Docker Compose and try again."
        exit 1
    }
    Print-Success "Docker Compose is available"

    Write-Host ""
    Print-Info "Choose installation method:"
    Write-Host ""
    Write-Host "  [1] Docker Only (Recommended for Windows)"
    Write-Host "      Command-line installation - works everywhere"
    Write-Host ""

    Write-Host "Enter choice [1]: " -NoNewline -ForegroundColor Cyan
    $choice = Read-Host

    switch ($choice) {
        "1" {
            Install-DockerMode
            Print-CompletionInfo
        }
        default {
            Print-Info "Using Docker-only mode..."
            Install-DockerMode
            Print-CompletionInfo
        }
    }
}

# Run main
Main

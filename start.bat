@echo off
REM Party Game Server - Easy Startup Script for Windows
REM Just double-click this file to start the server

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo    Party Game Server - Starting Up
echo ========================================
echo.

REM ============================================================================
REM STEP 1: Check Prerequisites
REM ============================================================================
echo [1/5] Checking prerequisites...

set MISSING=0

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   X Node.js NOT FOUND
    echo     Download from: https://nodejs.org
    set MISSING=1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo   OK Node.js %%i
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   X npm NOT FOUND
    set MISSING=1
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo   OK npm %%i
)

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   X Python NOT FOUND
    echo     Download from: https://python.org
    set MISSING=1
) else (
    for /f "tokens=*" %%i in ('python --version') do echo   OK %%i
)

where uv >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   X uv NOT FOUND
    echo     Install with: pip install uv
    echo     Or: https://docs.astral.sh/uv/getting-started/installation/
    set MISSING=1
) else (
    echo   OK uv installed
)

if %MISSING% EQU 1 (
    echo.
    echo Please install the missing software and try again.
    echo.
    pause
    exit /b 1
)
echo.

REM ============================================================================
REM STEP 2: Load Environment Variables
REM ============================================================================
echo [2/5] Loading configuration...

if exist ".env" (
    echo   OK Found .env file, loading...
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        REM Skip comments and empty lines
        set "line=%%a"
        if not "!line:~0,1!"=="#" if not "!line!"=="" (
            set "%%a=%%b"
        )
    )
) else (
    echo   ! No .env file found (optional - using defaults)
    echo     Create .env from .env.example for WiFi QR codes
)
echo.

REM ============================================================================
REM STEP 3: Install Python Dependencies
REM ============================================================================
echo [3/5] Installing Python dependencies...
uv sync
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install Python dependencies
    pause
    exit /b 1
)
echo   OK Python dependencies installed
echo.

REM ============================================================================
REM STEP 4: Install & Build Frontend
REM ============================================================================
echo [4/5] Building frontend...

if not exist "node_modules" (
    echo   Installing npm packages (first time setup)...
    call npm install
)

call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Failed to build frontend
    pause
    exit /b 1
)
echo   OK Frontend built successfully
echo.

REM ============================================================================
REM STEP 5: Start the Server
REM ============================================================================
echo [5/5] Starting server...
echo.

REM Get local IP (simplified for Windows)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "LOCAL_IP=%%a"
    set "LOCAL_IP=!LOCAL_IP: =!"
    goto :gotip
)
:gotip

if not defined PORT set PORT=13370

echo ========================================
echo    Server is starting!
echo ========================================
echo.
echo   TV Display:     http://%LOCAL_IP%:%PORT%/tv
echo   Player Join:    http://%LOCAL_IP%:%PORT%/mobile
echo   Admin Panel:    http://%LOCAL_IP%:%PORT%/admin
echo.
echo   Admin Password: y2k2025
echo.
echo   Players can scan the QR code on the TV to join!
echo.
echo Press Ctrl+C to stop the server
echo.

uv run python app.py --port %PORT%

pause

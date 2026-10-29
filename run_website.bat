@echo off
title Ceylon Rail - Sri Lanka Railway Reservation, Operations & Management System
color 0B

echo ===============================================================================
echo   CEYLON RAIL - SRI LANKA RAILWAY RESERVATION AND MANAGEMENT SYSTEM (v2.1)
echo   Guest Booking ^| Protected Staff Portal ^| Smart Travel Planner ^| SQLite DB
echo ===============================================================================
echo.

:: Verify project folders
if not exist "%~dp0backend\server.js" (
    echo [ERROR] Backend folder or server.js not found in "%~dp0backend".
    pause
    exit /b 1
)
if not exist "%~dp0frontend\package.json" (
    echo [ERROR] Frontend folder or package.json not found in "%~dp0frontend".
    pause
    exit /b 1
)

:: Ensure dedicated database folder exists (never deletes existing database files)
if not exist "%~dp0database" (
    mkdir "%~dp0database"
)

:: Verify Node.js installation
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your system PATH.
    echo Please install Node.js v18 - v24 from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [INFO] Detected Node.js version: %NODE_VER%
echo [INFO] Persistent SQLite Database: "%~dp0database\ceylon_rail.db"

:: Copy .env.example to .env if .env does not exist (never overwrites an existing .env)
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        echo [INFO] Creating initial .env configuration from .env.example...
        copy /Y "%~dp0.env.example" "%~dp0.env" >nul
    )
)

:: Install Backend Dependencies if needed
cd /d "%~dp0backend"
if not exist "node_modules" (
    echo [1/4] Installing Backend API dependencies ^(Express, CORS, sql.js^)...
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Backend dependencies already installed.
)

:: Install Frontend Dependencies if needed
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo [2/4] Installing Frontend dependencies ^(React 18, Vite, Tailwind, Lucide^)...
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
) else (
    echo [2/4] Frontend dependencies already installed.
)

:: Start Backend API Server (Initializes/migrates database/ceylon_rail.db safely while preserving data)
echo [3/4] Starting Ceylon Rail Backend API Server on http://localhost:5000 ...
cd /d "%~dp0backend"
start "Ceylon Rail Backend API (Port 5000)" cmd /k "node server.js"

timeout /t 3 /nobreak >nul

:: Start Frontend Vite Server
echo [4/4] Starting Ceylon Rail Frontend Application on http://localhost:5173 ...
cd /d "%~dp0frontend"
start "Ceylon Rail Frontend UI (Port 5173)" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo [SUCCESS] Ceylon Rail is running!
echo   - Passenger ^& Guest Portal  : http://localhost:5173
echo   - Railway Staff Portal      : Click "Staff Portal" in top navigation bar ^(Initial Admin: admin / 1234^)
echo   - SQLite Database File      : %~dp0database\ceylon_rail.db
echo   - Backend Health ^& DB Path  : http://localhost:5000/api/system/status
echo.
pause

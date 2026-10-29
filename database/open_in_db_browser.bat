@echo off
title Open Ceylon Rail Database in DB Browser for SQLite
set "DB_FILE=%~dp0ceylon_rail.db"

if not exist "%DB_FILE%" (
    echo [ERROR] Database file not found at: %DB_FILE%
    echo Please run run_website.bat or start the backend server once to initialize the database.
    pause
    exit /b 1
)

echo Locating DB Browser for SQLite...

where "DB Browser for SQLite.exe" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "" "DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b 0
)

if exist "%ProgramFiles%\DB Browser for SQLite\DB Browser for SQLite.exe" (
    start "" "%ProgramFiles%\DB Browser for SQLite\DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b 0
)

if exist "%ProgramFiles(x86)%\DB Browser for SQLite\DB Browser for SQLite.exe" (
    start "" "%ProgramFiles(x86)%\DB Browser for SQLite\DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b 0
)

if exist "%LocalAppData%\Programs\DB Browser for SQLite\DB Browser for SQLite.exe" (
    start "" "%LocalAppData%\Programs\DB Browser for SQLite\DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b 0
)

echo.
echo [INFO] DB Browser for SQLite was not found in standard installation folders.
echo You can download it from https://sqlitebrowser.org/ or open the database file manually:
echo   %DB_FILE%
echo.
pause

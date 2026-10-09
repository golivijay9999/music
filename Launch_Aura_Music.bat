@echo off
title Aura Music - Ad-Free Spotify Experience
echo ===================================================
echo     Starting Aura Music (Ad-Free Music Player)...
echo ===================================================
echo.
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in your PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Opening Aura Music in your browser...
start http://localhost:3000

echo Starting backend server on port 3000...
node server.js

pause

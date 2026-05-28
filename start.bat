@echo off
title cc-router
cd /d "%~dp0"

echo ===============================
echo   cc-router
echo ===============================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH.
    pause
    exit /b 1
)

:: Install dependencies (skip if already installed)
pip install -r requirements.txt -q

echo Starting cc-router on http://127.0.0.1:8082
echo Press Ctrl+C to stop.
echo.

python router.py
pause

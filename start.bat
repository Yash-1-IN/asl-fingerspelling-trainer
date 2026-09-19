@echo off
cd /d "%~dp0"
start "ASL Trainer Server (leave this open)" cmd /k python -m http.server 8000
timeout /t 1 /nobreak >nul
start "" http://localhost:8000

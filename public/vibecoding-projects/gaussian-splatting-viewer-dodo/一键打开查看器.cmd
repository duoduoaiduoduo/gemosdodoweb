@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

set "HAS_8080="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    set "HAS_8080=1"
)

if not defined HAS_8080 (
    echo [INFO] Starting Gaussian Splatting Viewer server...
    start "Gaussian Splatting Viewer Server" cmd /c "cd /d ""%~dp0"" && node server.js"
    timeout /t 2 >nul
) else (
    echo [INFO] Server is already running on port 8080.
)

echo [INFO] Opening viewer...
start "" "http://127.0.0.1:8080/veiw.html"
exit /b 0

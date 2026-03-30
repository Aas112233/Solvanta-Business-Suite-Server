@echo off
setlocal
title Solvanta Business Suite - Dev Servers

set "ROOT=%~dp0"
set "FRONTEND_PORT=3001"
set "BACKEND_PORT=5001"
set "FRONTEND_ORIGIN=http://localhost:%FRONTEND_PORT%"
set "BACKEND_ORIGIN=http://localhost:%BACKEND_PORT%"
set "BACKEND_CORS_ORIGIN=http://localhost:%FRONTEND_PORT%,http://127.0.0.1:%FRONTEND_PORT%"
cd /d "%ROOT%"

echo =========================================
echo Solvanta Business Suite - Dev Server Starter
echo =========================================
echo Frontend: %FRONTEND_ORIGIN%
echo Backend : %BACKEND_ORIGIN%

echo.
echo [1/4] Checking and killing process on port %FRONTEND_PORT% (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| find "LISTENING" ^| find ":%FRONTEND_PORT%"') do (
    echo Found process %%a listening on port %FRONTEND_PORT%. Killing it...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/4] Checking and killing process on port %BACKEND_PORT% (Backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| find "LISTENING" ^| find ":%BACKEND_PORT%"') do (
    echo Found process %%a listening on port %BACKEND_PORT%. Killing it...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [3/4] Starting Backend (Server) on port %BACKEND_PORT%...
if exist "%ROOT%server\package.json" (
    start "Backend (PORT %BACKEND_PORT%)" cmd /k "cd /d ""%ROOT%server"" && set PORT=%BACKEND_PORT%&& set CORS_ORIGIN=%BACKEND_CORS_ORIGIN%&& npm run dev"
) else (
    echo Skipped: "%ROOT%server\package.json" not found.
)

echo.
echo [4/4] Starting Frontend on port %FRONTEND_PORT%...
if exist "%ROOT%client\package.json" (
    start "Frontend (PORT %FRONTEND_PORT%)" cmd /k "cd /d ""%ROOT%client"" && set PORT=%FRONTEND_PORT%&& set VITE_DEV_API_PROXY=%BACKEND_ORIGIN%&& set VITE_DEV_SERVER_PORT=%FRONTEND_PORT%&& npm run dev -- --port %FRONTEND_PORT%"
) else (
    echo ERROR: "%ROOT%client\package.json" not found.
    echo Static dist fallback is disabled in dev mode because it serves stale builds.
    echo Use a client source checkout and run Vite dev server.
)

echo.
echo Dev servers have been started in new windows!
echo It is safe to close this window.
pause

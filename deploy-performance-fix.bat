@echo off
REM Performance Optimization Deployment Script for Windows
REM This script rebuilds and prepares the application for deployment

echo.
echo ============================================
echo   Performance Optimization Deployment
echo ============================================
echo.

REM Step 1: Navigate to client directory
echo [1/6] Navigating to client directory...
cd client
if errorlevel 1 (
    echo ERROR: Could not navigate to client directory
    pause
    exit /b 1
)

REM Step 2: Clean previous builds
echo [2/6] Cleaning previous builds...
if exist dist rmdir /s /q dist

REM Step 3: Install dependencies (if needed)
echo [3/6] Checking dependencies...
call npm install --production=false
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

REM Step 4: Build the application
echo [4/6] Building optimized production bundle...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Step 5: Verify build output
echo.
echo [5/6] Build completed successfully!
echo.
echo Build output in dist/ directory:
dir dist /b
echo.

REM Step 6: Show bundle size
echo [6/6] Bundle size summary:
powershell -Command "Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum | Select-Object @{Name='Size(MB)';Expression={[math]::Round($_.Sum/1MB,2)}}"
echo.

REM Navigate back to root
cd ..

echo ============================================
echo   Build Ready for Deployment!
echo ============================================
echo.
echo Next steps:
echo   1. Test locally: cd client ^&^& npm run preview
echo   2. Deploy to Vercel: vercel --prod
echo   3. Run Lighthouse audit on production URL
echo   4. Compare performance metrics
echo.
echo Expected improvements:
echo   - FCP: 4.4s to ~1.5-2.0s (60-65%% faster)
echo   - LCP: 5.5s to ~2.0-2.5s (55-60%% faster)
echo   - Speed Index: 11.2s to ~3.0-4.0s (65-70%% faster)
echo.
pause

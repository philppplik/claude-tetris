@echo off
REM uninstall.bat — claude-tetris sauber entfernen (per Doppelklick).
REM Entfernt nur unsere Hooks, laesst alle anderen (z.B. rune-kit) intakt.

set "PLUGIN_DIR=%~dp0"
if "%PLUGIN_DIR:~-1%"=="\" set "PLUGIN_DIR=%PLUGIN_DIR:~0,-1%"

cls
echo.
echo   claude-tetris Deinstaller
echo   =========================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js nicht gefunden — kann nicht deinstallieren.
  echo.
  pause
  exit /b 1
)

echo   [+] Entferne claude-tetris Hooks...
echo.
node "%PLUGIN_DIR%\scripts\uninstall.mjs"

echo.
echo   ============================================
echo     Fertig! claude-tetris wurde entfernt.
echo   ============================================
echo.
echo     (Deine anderen Hooks sind unveraendert.)
echo.
pause

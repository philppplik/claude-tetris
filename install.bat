@echo off
REM install.bat — claude-tetris per Doppelklick installieren.
REM Findet automatisch das Claude-Code-Verzeichnis und installiert die Hooks.
REM Keine Kommandozeilen-Kenntnisse nötig.

set "PLUGIN_DIR=%~dp0"
if "%PLUGIN_DIR:~-1%"=="\" set "PLUGIN_DIR=%PLUGIN_DIR:~0,-1%"

cls
echo.
echo   claude-tetris Installer
echo   ========================
echo.

REM 1. Node.js vorhanden?
where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js ist nicht installiert.
  echo.
  echo       Bitte von https://nodejs.org  LTS-Version herunterladen,
  echo       installieren und diese Datei erneut starten.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo   [+] Node.js gefunden: %NODE_VER%

REM 2. Claude-Code-Verzeichnis ermitteln
if defined CLAUDE_CONFIG_DIR (
  set "CLAUDE_DIR=%CLAUDE_CONFIG_DIR%"
) else (
  set "CLAUDE_DIR=%USERPROFILE%\.claude"
)
echo   [+] Claude-Code-Verzeichnis: %CLAUDE_DIR%
echo.

if not exist "%CLAUDE_DIR%" (
  mkdir "%CLAUDE_DIR%" >nul 2>&1
  echo       (Verzeichnis wurde angelegt)
)

REM 3. Hooks installieren
echo   [+] Installiere Hooks...
echo.
node "%PLUGIN_DIR%\scripts\install.mjs"
if errorlevel 1 (
  echo.
  echo   [X] Installation fehlgeschlagen.
  echo.
  pause
  exit /b 1
)

REM 4. Erfolg
echo.
echo   ============================================
echo     Fertig! claude-tetris ist installiert.
echo   ============================================
echo.
echo     Starte Claude Code neu, damit die Hooks
echo     greifen. Danach Split-Pane oeffnen mit:
echo.
echo       node "%PLUGIN_DIR%\scripts\launch.mjs"
echo.
echo     (oder: einfach diese Datei erneut starten
echo      und unten 'J' waehlen)
echo.

set /p "LAUNCH=Jetzt Split-Pane oeffnen? (J/N): "
if /i "%LAUNCH%"=="J" (
  echo.
  echo   [+] Oeffne Split-Pane...
  node "%PLUGIN_DIR%\scripts\launch.mjs"
)

echo.
pause

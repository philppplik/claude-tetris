@echo off
REM launch-split.bat — Oeffnet Windows Terminal mit zwei Panes:
REM   Links:  Claude Code (aktuelles Projekt)
REM   Rechts: claude-tetris (automatisch gekoppelt)
REM
REM Nutzung: launch-split.bat [projekt-pfad]
REM   Ohne Argument: aktuelles Verzeichnis

set "PLUGIN_DIR=%~dp0"
if "%PLUGIN_DIR:~-1%"=="\" set "PLUGIN_DIR=%PLUGIN_DIR:~0,-1%"

if "%~1"=="" (set "PROJECT_DIR=%CD%") else (set "PROJECT_DIR=%~1")

where wt.exe >nul 2>&1
if errorlevel 1 (
  echo [X] Windows Terminal (wt.exe) nicht gefunden.
  echo     Installiere es aus dem Microsoft Store.
  pause
  exit /b 1
)

REM Pfade fuer wt.exe aufbereiten (Backslashes verdoppeln fuer cmd /k)
set "PD=%PROJECT_DIR:\=\\%"
set "PD2=%PLUGIN_DIR:\=\\%"

wt.exe new-tab --title "Claude Code" cmd /k "cd /d \"%PD%\" && claude" ; split-pane --size 0.38 --title "claude-tetris" cmd /k "cd /d \"%PD2%\" && node \"%PD2%\bin\tetris.mjs\""

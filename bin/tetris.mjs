#!/usr/bin/env node
// bin/tetris.mjs — Einstiegspunkt für `npx claude-tetris` / direkten Aufruf.
// Startet die TUI. Die Pause-Kopplung an Claude Code erfolgt über die Hooks
// (scripts/tetris-signal.mjs), die state.json schreiben.

import { TetrisTUI } from "../game/tui.mjs";

const ui = new TetrisTUI();
ui.start();

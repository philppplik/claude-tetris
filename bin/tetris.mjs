#!/usr/bin/env node
// bin/tetris.mjs — Einstiegspunkt für `npx claude-tetris` / die globale CLI.
//
// Ohne Subkommando startet die TUI. Die Subkommandos delegieren an die
// Skripte in scripts/ — als eigener Prozess, damit ein process.exit() dort
// nicht das Spiel mitreißt.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = createRequire(import.meta.url)("../package.json");

const SCRIPTS = {
  install: "install.mjs",
  uninstall: "uninstall.mjs",
  launch: "launch.mjs",
};

const HELP = `claude-tetris v${version} — Tetris neben Claude Code.

  claude-tetris              Spielen (in diesem Terminal)
  claude-tetris launch       Split-Pane öffnen (Claude links, Tetris rechts)
  claude-tetris install      Claude-Code-Hooks installieren
  claude-tetris uninstall    Hooks wieder entfernen
  claude-tetris --version    Version ausgeben

Steuerung: ←→ bewegen · ↑/X drehen · ↓ soft drop · Space hard drop
           C hold · P pause · Q quit · R restart

launch akzeptiert einen Projektpfad und --backend=<wt|tmux|iterm|kitty|wezterm>.`;

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(HELP);
  process.exit(0);
}

if (cmd === "--version" || cmd === "-v") {
  console.log(version);
  process.exit(0);
}

if (cmd && SCRIPTS[cmd]) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", SCRIPTS[cmd]), ...rest], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

if (cmd && !cmd.startsWith("-")) {
  console.error(`Unbekanntes Kommando: ${cmd}\n`);
  console.error(HELP);
  process.exit(1);
}

// Kein Subkommando -> spielen.
const { TetrisTUI } = await import("../game/tui.mjs");
new TetrisTUI().start();

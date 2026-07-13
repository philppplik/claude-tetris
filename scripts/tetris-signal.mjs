#!/usr/bin/env node
// scripts/tetris-signal.mjs — Die Bridge zwischen Claude Code Hooks und dem Tetris.
//
// Claude Codes Hooks rufen dieses Script auf:
//   tetris-signal.mjs play     → Claude fängt an zu arbeiten → Tetris läuft
//   tetris-signal.mjs pause    → Claude ist fertig → Tetris pausiert
//   tetris-signal.mjs status   → gibt aktuellen Zustand als JSON aus
//
// Es schreibt nur die state.json (lib/signal.mjs) — kein Terminal-Zugriff nötig,
// deshalb funktioniert es auch aus Hooks heraus (die haben kein /dev/tty).

import { setPlay, setPause, readState, STATES } from "../lib/signal.mjs";

const cmd = process.argv[2] || "status";

switch (cmd) {
  case "play":
    setPlay("claude-code");
    console.log("▶ Tetris: PLAY (Claude arbeitet)");
    break;
  case "pause":
    setPause("claude-code");
    console.log("⏸ Tetris: PAUSE (Claude fertig)");
    break;
  case "status": {
    const { state, at } = readState();
    console.log(JSON.stringify({ state, at, playing: state === STATES.PLAY }));
    break;
  }
  default:
    console.error(`Unbekannt: ${cmd}. Nutzung: tetris-signal.mjs [play|pause|status]`);
    process.exit(1);
}

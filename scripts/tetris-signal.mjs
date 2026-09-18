#!/usr/bin/env node
// scripts/tetris-signal.mjs — Die Bridge zwischen Claude Code Hooks und dem Tetris.
//
// Claude Codes Hooks rufen dieses Script auf:
//   tetris-signal.mjs play     → Claude fängt an zu arbeiten → Tetris läuft
//   tetris-signal.mjs pause    → Claude ist fertig → Tetris pausiert
//   tetris-signal.mjs notify   → Claude braucht eine Erlaubnis → Tetris pausiert,
//                                damit man die Rückfrage nicht verpasst.
//                                Abschaltbar via CLAUDE_TETRIS_PAUSE_ON_PERMISSION=0
//   tetris-signal.mjs status   → gibt aktuellen Zustand als JSON aus
//
// Es schreibt nur die state.json (lib/signal.mjs) — kein Terminal-Zugriff nötig,
// deshalb funktioniert es auch aus Hooks heraus (die haben kein /dev/tty).

import { spawnSync } from "node:child_process";
import { setPlay, setPause, readState, STATES } from "../lib/signal.mjs";
import { readPanes } from "../lib/panes.mjs";
import { focusCommand, focusEnabled } from "../lib/focus.mjs";

/**
 * Tastaturfokus umhängen. Strikt best-effort: ein Hook darf Claude Code nie
 * ausbremsen oder mit einem Fehler behelligen, nur weil ein Terminal-Kommando
 * nicht da ist. Ohne Launcher (kein panes.json) passiert einfach nichts.
 */
function focus(target) {
  if (!focusEnabled()) return;
  const cmd = focusCommand(readPanes(), target);
  if (!cmd) return;
  try {
    spawnSync(cmd.command, cmd.args, { stdio: "ignore", shell: false, timeout: 2000 });
  } catch {
    /* Fokus ist Komfort, kein Vertrag. */
  }
}

const cmd = process.argv[2] || "status";

switch (cmd) {
  case "play":
    setPlay("claude-code");
    // Prompt ist raus -> rüber ins Spiel, ohne Klick.
    focus("game");
    console.log("▶ Tetris: PLAY (Claude arbeitet)");
    break;
  case "pause":
    setPause("claude-code");
    // Antwort ist da -> zurück zu Claude, damit man sofort weitertippen kann.
    focus("claude");
    console.log("⏸ Tetris: PAUSE (Claude fertig)");
    break;
  case "notify": {
    // Standardmäßig an: eine Permission-Rückfrage übersieht man leicht, wenn
    // nebenan ein Spiel läuft. Wer lieber weiterspielt, setzt die Variable auf 0.
    const off = /^(0|false|no|off)$/i.test(process.env.CLAUDE_TETRIS_PAUSE_ON_PERMISSION ?? "");
    if (off) {
      console.log("▶ Tetris: weiter (Pause bei Permission ist deaktiviert)");
      break;
    }
    setPause("claude-code-permission");
    // Rückfrage: Fokus MUSS zu Claude, sonst tippt man ins Spiel statt zu antworten.
    focus("claude");
    console.log("⏸ Tetris: PAUSE (Claude braucht eine Erlaubnis)");
    break;
  }
  case "status": {
    const { state, at } = readState();
    console.log(JSON.stringify({ state, at, playing: state === STATES.PLAY }));
    break;
  }
  default:
    console.error(`Unbekannt: ${cmd}. Nutzung: tetris-signal.mjs [play|pause|notify|status]`);
    process.exit(1);
}

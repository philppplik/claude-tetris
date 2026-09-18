// lib/panes.mjs — Wer ist welche Pane?
//
// Der Launcher weiß, welche Pane Claude ist und welche das Spiel. Die Hooks
// laufen später in einem völlig anderen Prozess und wissen es nicht — also legt
// der Launcher es neben der Signal-Datei ab.
//
// Gleiche Regeln wie signal.mjs: atomar schreiben, tolerant lesen. Fehlt oder
// bricht die Datei, wird eben nicht fokussiert; das Spiel läuft trotzdem.

import fs from "node:fs";
import path from "node:path";
import { getStateDir, ensureStateDir } from "./signal.mjs";

export function getPanesPath() {
  return path.join(getStateDir(), "panes.json");
}

/**
 * @typedef {object} Panes
 * @property {string} backend   wt | tmux | iterm | kitty | wezterm
 * @property {string|null} window  Fenster-Kennung (nur wt)
 * @property {string|null} claude  Pane-Kennung von Claude Code
 * @property {string|null} game    Pane-Kennung des Spiels
 */

/** @returns {Panes|null} */
export function readPanes() {
  try {
    const raw = JSON.parse(fs.readFileSync(getPanesPath(), "utf8"));
    if (!raw || typeof raw.backend !== "string") return null;
    return {
      backend: raw.backend,
      window: str(raw.window),
      claude: str(raw.claude),
      game: str(raw.game),
    };
  } catch {
    return null;
  }
}

export function writePanes(panes) {
  try {
    ensureStateDir();
    const dest = getPanesPath();
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(panes, null, 2) + "\n");
    fs.renameSync(tmp, dest);
    return true;
  } catch {
    return false; // Nicht schreibbar: dann eben kein Autofokus.
  }
}

export function clearPanes() {
  try {
    fs.rmSync(getPanesPath(), { force: true });
  } catch {
    /* egal */
  }
}

function str(v) {
  return typeof v === "string" && v.length > 0 ? v : null;
}

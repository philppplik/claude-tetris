// signal.mjs — Der Signal-Kanal zwischen Claude Code (Hooks) und dem Tetris-TUI.
//
// Claude Codes Hooks SCHREIBEN den Zustand (PLAY/PAUSE), das Tetris-TUI LIEST ihn.
// Kommunikation läuft über eine kleine JSON-State-Datei — die robusteste Variante
// auf Windows (keine Sockets/Named-Pipes/Ports nötig).
//
// Robustheit:
//  - Schreiben ist ATOMAR (temp-Datei + rename), damit der Leser nie eine
//    halb-geschriebene Datei erwischt.
//  - Lesen ist TOLERANT (fehlt die Datei oder ist sie kurz kaputt → Fallback).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Gültige Zustände. */
export const STATES = Object.freeze({
  PLAY: "PLAY", // Claude cookt → Spiel läuft
  PAUSE: "PAUSE", // Claude wartet/fertig → Spiel pausiert
});

/** Verzeichnis, in dem der State liegt: ~/.claude-tetris/ */
export function getStateDir() {
  // Erlaubt Override via Env (nützlich für Tests und mehrere Instanzen).
  if (process.env.CLAUDE_TETRIS_DIR) return process.env.CLAUDE_TETRIS_DIR;
  return path.join(os.homedir(), ".claude-tetris");
}

/** Vollständiger Pfad zur State-Datei. */
export function getStatePath() {
  return path.join(getStateDir(), "state.json");
}

/** Stellt sicher, dass das State-Verzeichnis existiert. */
export function ensureStateDir() {
  const dir = getStateDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Schreibt den Zustand atomar.
 * @param {"PLAY"|"PAUSE"} state
 * @param {object} [extra]  z.B. { reason: "UserPromptSubmit" }
 * @returns {object} das geschriebene State-Objekt
 */
export function writeState(state, extra = {}) {
  if (state !== STATES.PLAY && state !== STATES.PAUSE) {
    throw new Error(`Ungültiger State: ${state} (erlaubt: PLAY, PAUSE)`);
  }
  ensureStateDir();
  const payload = {
    state,
    ts: Date.now(),
    ...extra,
  };
  const target = getStatePath();
  // Eindeutiger Temp-Name pro Prozess, um Kollisionen zu vermeiden.
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const json = JSON.stringify(payload);
  fs.writeFileSync(tmp, json, "utf8");
  // Atomarer Swap. renameSync ersetzt vorhandene Datei (auch auf Windows in
  // modernem Node). Falls es doch mal klemmt: aufräumen + einmal direkt schreiben.
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.writeFileSync(target, json, "utf8");
    } finally {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        /* egal */
      }
    }
  }
  return payload;
}

/**
 * Liest den aktuellen Zustand tolerant.
 * @param {object} [opts]
 * @param {"PLAY"|"PAUSE"} [opts.fallback=PAUSE]  Wert, wenn keine gültige Datei da ist.
 * @returns {{state:string, ts:number, reason?:string}}
 */
export function readState({ fallback = STATES.PAUSE } = {}) {
  const target = getStatePath();
  try {
    const raw = fs.readFileSync(target, "utf8");
    const data = JSON.parse(raw);
    if (data && (data.state === STATES.PLAY || data.state === STATES.PAUSE)) {
      return data;
    }
    // Datei da, aber Inhalt unerwartet → Fallback.
    return { state: fallback, ts: 0, reason: "invalid-content" };
  } catch {
    // Datei fehlt oder ist gerade nicht lesbar → Fallback.
    return { state: fallback, ts: 0, reason: "no-file" };
  }
}

/** Bequeme Kurzformen für die Hook-Scripts. */
export function setPlay(reason = "hook") {
  return writeState(STATES.PLAY, { reason });
}
export function setPause(reason = "hook") {
  return writeState(STATES.PAUSE, { reason });
}

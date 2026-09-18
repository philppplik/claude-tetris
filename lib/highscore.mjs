// lib/highscore.mjs — Persistenter Highscore neben der Signal-Datei.
//
// Gleiche Robustheits-Regeln wie signal.mjs: atomar schreiben (temp + rename),
// tolerant lesen. Ein kaputter Highscore darf niemals das Spiel verhindern —
// im Zweifel fangen wir bei 0 an.

import fs from "node:fs";
import path from "node:path";
import { getStateDir, ensureStateDir } from "./signal.mjs";

export function getHighscorePath() {
  return path.join(getStateDir(), "highscore.json");
}

/**
 * Liest den Highscore. Liefert immer ein brauchbares Objekt, nie einen Fehler.
 * @returns {{score: number, lines: number, level: number, at: string|null}}
 */
export function readHighscore() {
  const empty = { score: 0, lines: 0, level: 0, at: null };
  try {
    const raw = JSON.parse(fs.readFileSync(getHighscorePath(), "utf8"));
    const score = Number(raw?.score);
    if (!Number.isFinite(score) || score < 0) return empty;
    return {
      score,
      lines: Number(raw?.lines) || 0,
      level: Number(raw?.level) || 0,
      at: typeof raw?.at === "string" ? raw.at : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Schreibt den Highscore, aber nur wenn er den bisherigen schlägt.
 * @returns {{record: object, beaten: boolean}}
 */
export function writeHighscore({ score, lines = 0, level = 0 }) {
  const previous = readHighscore();
  if (!Number.isFinite(score) || score <= previous.score) {
    return { record: previous, beaten: false };
  }
  const record = { score, lines, level, at: new Date().toISOString() };
  try {
    ensureStateDir();
    const dest = getHighscorePath();
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
    fs.renameSync(tmp, dest);
  } catch {
    // Nicht schreibbar (read-only Home, volle Platte): das Spiel läuft weiter,
    // der Rekord ist nur nicht persistent.
    return { record, beaten: true };
  }
  return { record, beaten: true };
}

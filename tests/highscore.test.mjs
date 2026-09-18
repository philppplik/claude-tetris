// tests/highscore.test.mjs — Persistenter Rekord. Schreibt nur in ein Temp-Dir.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = path.join(os.tmpdir(), `ct-hs-${process.pid}-${Date.now()}`);
process.env.CLAUDE_TETRIS_DIR = DIR;

const { readHighscore, writeHighscore, getHighscorePath } = await import(
  "../lib/highscore.mjs"
);

function fresh() {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
}

test("ohne Datei startet der Rekord bei 0", () => {
  fresh();
  assert.deepEqual(readHighscore(), { score: 0, lines: 0, level: 0, at: null });
});

test("ein besserer Score wird geschrieben und wiedergelesen", () => {
  fresh();
  const { beaten } = writeHighscore({ score: 1200, lines: 14, level: 1 });
  assert.equal(beaten, true);
  const r = readHighscore();
  assert.equal(r.score, 1200);
  assert.equal(r.lines, 14);
  assert.equal(r.level, 1);
  assert.ok(r.at, "Zeitstempel gesetzt");
});

test("ein schlechterer Score überschreibt den Rekord nicht", () => {
  fresh();
  writeHighscore({ score: 5000 });
  const { beaten } = writeHighscore({ score: 100 });
  assert.equal(beaten, false);
  assert.equal(readHighscore().score, 5000);
});

test("Gleichstand zählt nicht als neuer Rekord", () => {
  fresh();
  writeHighscore({ score: 800 });
  assert.equal(writeHighscore({ score: 800 }).beaten, false);
});

test("kaputte Datei blockiert das Spiel nicht", () => {
  fresh();
  fs.writeFileSync(getHighscorePath(), "{ das ist kein JSON");
  assert.deepEqual(readHighscore(), { score: 0, lines: 0, level: 0, at: null });
  // Und ein neuer Score repariert die Datei.
  writeHighscore({ score: 10 });
  assert.equal(readHighscore().score, 10);
});

test("unsinnige Werte in der Datei werden verworfen", () => {
  fresh();
  for (const bad of ['{"score":"viele"}', '{"score":-5}', '{"score":null}', "[]"]) {
    fs.writeFileSync(getHighscorePath(), bad);
    assert.equal(readHighscore().score, 0, `verworfen: ${bad}`);
  }
});

test("Schreiben ist atomar: keine Temp-Datei bleibt liegen", () => {
  fresh();
  writeHighscore({ score: 42 });
  const leftovers = fs.readdirSync(DIR).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("NaN oder Infinity werden nicht als Rekord akzeptiert", () => {
  fresh();
  assert.equal(writeHighscore({ score: NaN }).beaten, false);
  assert.equal(writeHighscore({ score: Infinity }).beaten, false);
  assert.equal(readHighscore().score, 0);
});

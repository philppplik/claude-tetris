// tests/ghost.test.mjs — Ghost-Piece (Landeposition) funktioniert korrekt.

import test from "node:test";
import assert from "node:assert/strict";
import { Tetris } from "../game/core.mjs";

// Deterministic RNG (LCG) für reproduzierbare Stücke
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test("getGhostRow liegt über dem Boden bei leerem Feld", () => {
  const g = new Tetris(makeRng(42));
  const gr = g.getGhostRow();
  assert.ok(gr !== null, "Ghost-Row berechnet");
  assert.ok(gr >= g.current.row, "Ghost ist nicht höher als das Stück");
});

test("getGhostRow liegt am Boden bei vollgefülltem Boden (außer oberste Reihe)", () => {
  const g = new Tetris(makeRng(7));
  // Boden komplett füllen außer eine Spalte
  for (let c = 0; c < 10; c++) g.board[19][c] = "X";
  for (let c = 0; c < 10; c++) g.board[18][c] = "X";
  const before = g.current.row;
  const gr = g.getGhostRow();
  assert.ok(gr > before, "Stück fällt auf den Stapel");
  // Das Stück darf nicht in den gefüllten Bereich ragen
  assert.ok(gr < 18, "Ghost bleibt über dem Stapel");
});

test("getView markiert Ghost mit 'G' wo das Feld leer ist", () => {
  const g = new Tetris(makeRng(99));
  const view = g.getView();
  // Mindestens eine Ghost-Zelle muss existieren (da Stück nicht am Boden)
  let ghostCells = 0;
  let pieceCells = 0;
  for (const row of view)
    for (const cell of row) {
      if (cell === "G") ghostCells++;
      else if (cell !== "." && cell !== 0) pieceCells++;
    }
  assert.ok(pieceCells >= 4, "Stück gezeichnet");
  assert.ok(ghostCells >= 1, "Ghost markiert");
});

test("getView ohne ghost-Option zeigt keinen Ghost", () => {
  const g = new Tetris(makeRng(123));
  const view = g.getView({ ghost: false });
  let ghostCells = 0;
  for (const row of view)
    for (const cell of row) if (cell === "G") ghostCells++;
  assert.equal(ghostCells, 0, "Kein Ghost wenn ghost:false");
});

// tests/core.test.mjs — Headless-Engine-Tests für game/core.mjs.
// Ausführen: node --test

import test from "node:test";
import assert from "node:assert/strict";
import { Tetris, WIDTH, HEIGHT, SHAPES } from "../game/core.mjs";

/** Einfacher, deterministischer RNG (mulberry32) für reproduzierbare Tests. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("reset: leeres Board, Score 0, nicht Game-Over", () => {
  const g = new Tetris({ rng: seeded(1) });
  assert.equal(g.score, 0);
  assert.equal(g.lines, 0);
  assert.equal(g.level, 0);
  assert.equal(g.gameOver, false);
  assert.ok(g.current, "aktuelles Stück vorhanden");
  // Board komplett leer außer Spawn-Zeile(n)
  const occupied = g.board.flat().filter((v) => v !== 0).length;
  assert.equal(occupied, 0); // Spawn ist oben in r=0, aber leer im Board bis Lock
});

test("7-Bag: jede Stück-Type erscheint innerhalb von 7 Spawns genau 1×", () => {
  const g = new Tetris({ rng: seeded(42) });
  const seen = [];
  for (let i = 0; i < 7; i++) {
    seen.push(g.current.type);
    g.hardDrop(); // vermeidet Game-Over im leeren Feld
  }
  const sorted = [...seen].sort().join(",");
  assert.equal(sorted, "I,J,L,O,S,T,Z", `Bekommen: ${sorted}`);
});

test("Rotation: T rotiert 4× zurück zur Ausgangsform", () => {
  const g = new Tetris({ rng: seeded(7) });
  g.current = { type: "T", rot: 0, row: 5, col: 3 };
  const before = JSON.stringify(g._cells(g.current));
  g.rotate(1);
  g.rotate(1);
  g.rotate(1);
  g.rotate(1);
  const after = JSON.stringify(g._cells(g.current));
  assert.equal(after, before, "nach 4× Rotation identische Zellen");
});

test("Rotation: T im leeren Feld dreht ohne Kick", () => {
  const g = new Tetris({ rng: seeded(7) });
  g.current = { type: "T", rot: 0, row: 5, col: 3 };
  assert.equal(g.rotate(1), true);
  assert.equal(g.current.rot, 1);
});

test("Wall-Kick: I-Stück an der linken Wand kickt rein", () => {
  const g = new Tetris({ rng: seeded(7) });
  // I an Position ganz links, rot 0 -> rot 1 sollte per Kick möglich sein
  g.current = { type: "I", rot: 0, row: 2, col: -1 + 3 }; // col so, dass rechtsrand nah
  g.current.col = 0; // minimale Spalte
  const ok = g.rotate(1);
  assert.equal(ok, true, "Rotation an Wand sollte per Kick gelingen");
  assert.equal(g.current.rot, 1);
});

test("move: kann nicht aus dem Feld laufen", () => {
  const g = new Tetris({ rng: seeded(3) });
  g.current = { type: "O", rot: 0, row: 5, col: 0 };
  assert.equal(g.move(-1), false, "links aus Feld = blockiert");
  assert.equal(g.current.col, 0);
  // nach rechts bis ans Limit
  let moved = 0;
  while (g.move(1)) moved++;
  assert.ok(moved > 0);
  // eine weitere Bewegung nach rechts darf nicht überstehen
  assert.equal(g._collides(g.current, 0, 1, 0), true);
});

test("softDrop: bewegt runter, punktet +1", () => {
  const g = new Tetris({ rng: seeded(5) });
  g.current = { type: "O", rot: 0, row: 0, col: 4 };
  const before = g.current.row;
  g.softDrop();
  assert.equal(g.current.row, before + 1);
  assert.equal(g.score, 1);
});

test("hardDrop: fällt auf Boden, Lockt, nächstes Stück spawnt", () => {
  const g = new Tetris({ rng: seeded(9) });
  g.current = { type: "O", rot: 0, row: 0, col: 4 };
  const dist = g.hardDrop();
  assert.ok(dist > 0);
  // Nach Lock ist ein neues Stück aktiv
  assert.ok(g.current);
  assert.equal(g.gameOver, false);
  // Es liegt jetzt was im Board (2 Zeilen O)
  const occ = g.board.flat().filter((v) => v === "O").length;
  assert.equal(occ, 4, "O-Stück hat 4 Zellen hinterlassen");
});

test("Line-Clear: volle Zeile wird gelöscht + Punktet", () => {
  const g = new Tetris({ rng: seeded(11) });
  // Unterste Zeile komplett füllen bis auf die 4 linke Spalten (0..3).
  for (let c = 4; c < WIDTH; c++) g.board[HEIGHT - 1][c] = "X";
  // I-Stück, rot 0 = horizontal in Zeile (row+1), belegt col 0..3.
  g.current = { type: "I", rot: 0, row: HEIGHT - 2, col: 0 };
  // hardDrop lässt es bis auf Boden fallen -> Zellen landen in HEIGHT-1, col 0..3.
  g.hardDrop();
  // Jetzt muss die unterste Zeile voll sein und gecleart werden.
  assert.equal(g.lines, 1, `1 Linie gecleart, war ${g.lines}`);
  assert.ok(g.score >= 100, `Score durch Line-Clear, war ${g.score}`);
  // Unterstes Board jetzt wieder leer (da gecleart).
  assert.equal(
    g.board[HEIGHT - 1].every((v) => v === 0),
    true,
    "unterste Zeile nach Clear leer"
  );
});

test("Game-Over: Spawn kollidiert bei vollem Stapel", () => {
  const g = new Tetris({ rng: seeded(13) });
  // Board bis knapp unter Spawn vollständig füllen
  for (let r = HEIGHT - 4; r < HEIGHT; r++)
    for (let c = 0; c < WIDTH; c++) g.board[r][c] = "X";
  // Nächstes Spawn (r=0) kollidiert nicht, aber ein weiteres nach Stack-Wachstum
  // Simuliere: wir füllen Zeile 0-1 auch, dann muss Spawn sofort Game-Over sein.
  for (let c = 0; c < WIDTH; c++) {
    g.board[0][c] = "X";
    g.board[1][c] = "X";
  }
  const result = g.spawn("T");
  assert.equal(result, false);
  assert.equal(g.gameOver, true);
});

test("Hold: tauscht Stück, nur 1× pro Fall", () => {
  const g = new Tetris({ rng: seeded(17) });
  const first = g.current.type;
  g.holdPiece();
  assert.notEqual(g.current.type, first, "nach Hold ist ein anderes Stück aktiv");
  assert.equal(g.old, first, "Hold-Slot hält das erste Stück");
  const after = g.current.type;
  g.holdPiece(); // 2. Mal -> darf nicht tauschen
  assert.equal(g.current.type, after, "2. Hold im selben Fall wird ignoriert");
});

test("Hold dann Spawn setzt canHold zurück", () => {
  const g = new Tetris({ rng: seeded(19) });
  g.holdPiece();
  assert.equal(g.canHold, false);
  g.hardDrop(); // Spawn setzt canHold=true
  assert.equal(g.canHold, true);
});

test("getView enthält aktuelles Stück", () => {
  const g = new Tetris({ rng: seeded(23) });
  const view = g.getView();
  assert.equal(view.length, HEIGHT);
  assert.equal(view[0].length, WIDTH);
  // Das aktuelle Stück muss in der View sichtbar sein
  const t = g.current.type;
  const found = view.flat().filter((v) => v === t).length;
  assert.equal(found, 4, "4 Zellen des aktuellen Stücks in der View");
});

test("step: Gravitation lässt Stück runterfallen", () => {
  const g = new Tetris({ rng: seeded(29) });
  g.current = { type: "O", rot: 0, row: 0, col: 4 };
  const before = g.current.row;
  g.step();
  assert.equal(g.current.row, before + 1);
});

test("deterministisch: gleicher Seed -> gleiche Stück-Sequenz", () => {
  const a = new Tetris({ rng: seeded(100) });
  const b = new Tetris({ rng: seeded(100) });
  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 14; i++) {
    seqA.push(a.current.type);
    seqB.push(b.current.type);
    a.hardDrop();
    b.hardDrop();
  }
  assert.equal(seqA.join(""), seqB.join(""));
});

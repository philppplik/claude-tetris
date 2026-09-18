// tests/lockdelay.test.mjs — Ein aufsetzendes Stück bleibt kurz beweglich.
// Uhr injiziert, damit nichts von echter Zeit abhängt.

import test from "node:test";
import assert from "node:assert/strict";
import { Tetris, HEIGHT, LOCK_DELAY_MS, MAX_LOCK_RESETS } from "../game/core.mjs";

/** Spiel mit steuerbarer Uhr. */
function game(opts = {}) {
  let t = 1000;
  const g = new Tetris({ rng: () => 0.5, now: () => t, ...opts });
  return {
    g,
    advance(ms) { t += ms; },
    at() { return t; },
  };
}

/** Stück direkt über den Boden setzen. */
function dropToFloor(g) {
  while (!g._collides(g.current, 1, 0, 0)) g.current.row += 1;
}

test("aufsetzen lockt nicht sofort", () => {
  const { g, advance } = game();
  dropToFloor(g);
  const type = g.current.type;

  g.step(); // erster Kontakt: Timer startet
  assert.equal(g.grounded, true);
  assert.equal(g.current.type, type, "Stück lebt noch");

  advance(LOCK_DELAY_MS - 1);
  g.step();
  assert.equal(g.current.type, type, "vor Ablauf immer noch beweglich");
});

test("nach Ablauf des Lock-Delay setzt es fest", () => {
  const { g, advance } = game();
  dropToFloor(g);
  g.step();

  advance(LOCK_DELAY_MS);
  g.step();
  // Board hat jetzt belegte Zellen in der untersten Reihe.
  assert.ok(g.board[HEIGHT - 1].some((c) => c !== 0), "Stück im Board eingebettet");
  assert.equal(g.grounded, false, "Lock-State für das neue Stück zurückgesetzt");
  assert.equal(g.lockResets, 0);
});

test("Bewegung am Boden setzt den Timer zurück (das ist der Slide)", () => {
  const { g, advance } = game();
  dropToFloor(g);
  g.step();
  const type = g.current.type;

  // Kurz vor Ablauf bewegen -> neue volle Frist.
  advance(LOCK_DELAY_MS - 10);
  assert.equal(g.move(-1), true);
  assert.equal(g.lockResets, 1);

  advance(LOCK_DELAY_MS - 10);
  g.step();
  assert.equal(g.current.type, type, "dank Reset noch nicht gelockt");
});

test("Drehung am Boden setzt den Timer ebenfalls zurück", () => {
  const { g, advance } = game({ rng: () => 0.1 });
  // O-Stück dreht nicht — ein drehbares erzwingen.
  g.current = { type: "T", rot: 0, row: 0, col: 4 };
  dropToFloor(g);
  g.step();
  const before = g.lockAt;

  advance(100);
  assert.equal(g.rotate(1), true);
  assert.ok(g.lockAt > before, "Frist verlängert");
});

test("das Reset-Budget ist begrenzt (kein endloses Wackeln)", () => {
  const { g, advance } = game();
  g.current = { type: "T", rot: 0, row: 0, col: 4 };
  dropToFloor(g);
  g.step();

  // Mehr Bewegungen als erlaubte Resets.
  for (let i = 0; i < MAX_LOCK_RESETS + 10; i++) {
    advance(10);
    g.move(i % 2 === 0 ? -1 : 1);
  }
  assert.equal(g.lockResets, MAX_LOCK_RESETS, "bei 15 gedeckelt");

  // Budget aufgebraucht -> die Frist läuft jetzt wirklich ab.
  advance(LOCK_DELAY_MS + 1);
  g.step();
  assert.ok(g.board[HEIGHT - 1].some((c) => c !== 0), "trotz Wackelns gelockt");
});

test("wieder in der Luft: Timer stoppt, Budget wird NICHT aufgefüllt", () => {
  const { g, advance } = game();
  // Loch neben dem Stück: seitlich rüber fällt es weiter.
  g.board[HEIGHT - 1] = g.board[HEIGHT - 1].map((_, c) => (c < 5 ? "I" : 0));
  g.current = { type: "O", rot: 0, row: HEIGHT - 3, col: 3 };
  g.step();
  assert.equal(g.grounded, true);

  advance(10);
  g.move(1); // teilweise über das Loch
  g.move(1);
  assert.equal(g.grounded, false, "nicht mehr aufgesetzt");
  assert.equal(g.lockAt, null, "Timer gestoppt");
  assert.ok(g.lockResets > 0, "verbrauchte Resets bleiben verbraucht");
});

test("softDrop am Boden lockt nicht sofort", () => {
  const { g } = game();
  dropToFloor(g);
  const type = g.current.type;
  assert.equal(g.softDrop(), false, "kann nicht weiter runter");
  assert.equal(g.current.type, type, "aber noch nicht festgesetzt");
  assert.equal(g.grounded, true, "Timer läuft");
});

test("hardDrop lockt weiterhin sofort", () => {
  const { g } = game();
  const type = g.current.type;
  g.hardDrop();
  assert.ok(
    g.board.some((row) => row.includes(type)),
    "sofort im Board"
  );
});

test("lockDelay 0 verhält sich wie vorher (sofortiger Lock)", () => {
  const { g } = game({ lockDelay: 0 });
  dropToFloor(g);
  g.step();
  assert.ok(g.board[HEIGHT - 1].some((c) => c !== 0), "im selben Schritt gelockt");
});

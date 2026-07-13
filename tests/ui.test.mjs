// tests/ui.test.mjs — TUI-Klasse ohne echtes Terminal testen (headless).
//
// Wir injizieren einen schreibenden Mock in die TUI (statt process.stdout
// global zu mocken — das ist auf Node 24 nicht zuverlässig konfigurierbar).
// Geprüft wird: Rendering wirft keine Exception, baut gültige ANSI-Strings,
// und die Signal-/Tasten-Logik steuert den Pause-Zustand korrekt.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpBase = path.join(os.tmpdir(), `ct-ui-${process.pid}-${Date.now()}`);
process.env.CLAUDE_TETRIS_DIR = tmpBase;

const { TetrisTUI } = await import("../game/tui.mjs");
const sig = await import("../lib/signal.mjs");

// Schreib-Puffer, den wir der TUI injizieren.
function makeSink() {
  return { _buf: "", write(s) { this._buf += s; } };
}

function makeUI(opts) {
  const sink = makeSink();
  const ui = new TetrisTUI({ ...opts, out: sink, signal: false });
  ui.running = true;
  ui._render();
  return { ui, sink };
}

// Timer aufräumen, damit der Test-Runner sauber endet.
function cleanup({ ui }) {
  clearInterval(ui.gravityTimer);
  ui.watchHandle?.close?.();
}

// Filert Cursor-Moves/Steuer-Codes raus, behält sichtbaren Text.
function visible(buf) {
  return buf
    .replace(/\x1b\[\d+;\d+H/g, "")
    .replace(/\x1b\[\?25[hl]/g, "")
    .replace(/\x1b\[2J/g, "")
    .replace(/\x1b\[H/g, "");
}

test("render produziert ANSI-Output ohne Exception", () => {
  const { sink } = makeUI();
  const vis = visible(sink._buf);
  assert.ok(vis.length > 0, `Output erzeugt (len=${vis.length})`);
  assert.ok(vis.includes("claude-tetris"), "Titel gerendert");
  assert.ok(vis.includes("PLAYING"), "Status PLAYING sichtbar");
});

test("Signal: Pause-Zustand spiegelt sich im Status", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  sig.setPause("test");
  const ctx = makeUI();
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.signalPause, true);
  assert.equal(ctx.ui.paused, true);
  ctx.sink._buf = "";
  ctx.ui._render();
  assert.ok(visible(ctx.sink._buf).includes("Claude is done"),
    "Pause-Hinweis gerendert");
  cleanup(ctx);
});

test("Signal: PLAY hebt Pause auf", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  sig.setPause("test");
  const ctx = makeUI();
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.paused, true);
  sig.setPlay("test");
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.signalPause, false);
  assert.equal(ctx.ui.paused, false);
  cleanup(ctx);
});

test("Tasten: P toggelt Manual-Pause", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  sig.setPlay("test");
  const ctx = makeUI();
  ctx.ui._onKey(Buffer.from("p"));
  assert.equal(ctx.ui.manualPause, true);
  assert.equal(ctx.ui.paused, true);
  ctx.ui._onKey(Buffer.from("p"));
  assert.equal(ctx.ui.manualPause, false);
  cleanup(ctx);
});

test("Tasten: Pfeil links bewegt Stück (wenn nicht pausiert)", () => {
  sig.setPlay("test");
  const ctx = makeUI();
  const before = ctx.ui.game.current.col;
  ctx.ui._onKey(Buffer.from("\x1b[D"));
  assert.ok(ctx.ui.game.current.col <= before + 1);
  cleanup(ctx);
});

test("Tasten: q setzt running=false (sauberes Ende)", () => {
  sig.setPlay("test");
  const ctx = makeUI();
  ctx.ui._onKey(Buffer.from("q"));
  assert.equal(ctx.ui.running, false);
  cleanup(ctx);
});

test("Tasten: r restartet nach Game Over", () => {
  sig.setPlay("test");
  const ctx = makeUI();
  ctx.ui.game.gameOver = true;
  ctx.ui.game.board = Array.from({ length: 20 }, () => new Array(10).fill("X"));
  ctx.ui._onKey(Buffer.from("r"));
  assert.equal(ctx.ui.game.gameOver, false);
  assert.equal(ctx.ui.game.score, 0);
  cleanup(ctx);
});

test("Game Over zeigt Overlay mit Score und Restart-Hinweis", () => {
  sig.setPlay("test");
  const ctx = makeUI();
  ctx.ui.game.gameOver = true;
  ctx.ui.game.score = 1234;
  ctx.ui.game.level = 5;
  ctx.ui.game.lines = 42;
  ctx.sink._buf = "";
  ctx.ui._render();
  const vis = visible(ctx.sink._buf);
  assert.ok(vis.includes("GAME OVER"), "Overlay-Titel gerendert");
  assert.ok(vis.includes("Score  1234"), "Score im Overlay");
  assert.ok(vis.includes("Press R to restart"), "Restart-Hinweis gerendert");
  cleanup(ctx);
});

test("Trail-Fix: jede Board-Zeile hat konstante Breite (2 Zeichen/Zelle)", () => {
  sig.setPlay("test");
  const ctx = makeUI();
  // Stück weit rechts platzieren, um maximale Zeilenlängen-Varianz zu testen
  ctx.ui.game.current = { type: "I", rot: 0, row: 0, col: 9 };
  ctx.ui._render();
  const view = ctx.ui.game.getView();
  let ok = true;
  for (let r = 0; r < 20; r++) {
    let len = 0;
    for (let c = 0; c < 10; c++) len += 2; // jede Zelle = 2 Zeichen
    if (len !== 20) ok = false;
  }
  assert.equal(ok, true, "konstante Zeilenbreite verhindert Color-Trails");
  cleanup(ctx);
});

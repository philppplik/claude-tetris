// tests/integration.test.mjs — Voller Kopplungs-Kreis:
// Hook-Script schreibt Pause/Play → state.json → TUI pollt → Spiel friert/ läuft.
//
// Simuliert exakt das, was in Produktion passiert: ein Claude-Code-Hook ruft
// scripts/tetris-signal.mjs auf, das Tetris-TUI liest den Zustand per Polling.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tmpBase = path.join(os.tmpdir(), `ct-int-${process.pid}-${Date.now()}`);
process.env.CLAUDE_TETRIS_DIR = tmpBase;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNAL = path.join(ROOT, "scripts", "tetris-signal.mjs");

const { TetrisTUI } = await import("../game/tui.mjs");

function makeSink() {
  return { _buf: "", write(s) { this._buf += s; } };
}
function makeUI() {
  const sink = makeSink();
  const ui = new TetrisTUI({ out: sink, signal: false });
  ui.running = true;
  ui._render();
  return { ui, sink };
}
function cleanup({ ui }) {
  clearInterval(ui.gravityTimer);
  ui.watchHandle?.close?.();
}
function callHook(cmd) {
  execFileSync("node", [SIGNAL, cmd], { env: process.env });
}

test("Hook 'pause' friert das Tetris nach Poll ein", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  callHook("play"); // erst mal spielen
  const ctx = makeUI();
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.paused, false, "Spielt nach play");

  callHook("pause"); // Claude ist fertig
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.signalPause, true);
  assert.equal(ctx.ui.paused, true, "Tetris pausiert nach Hook-pause");

  // Status-Text im Render spiegelt Pause
  ctx.sink._buf = "";
  ctx.ui._render();
  const vis = ctx.sink._buf
    .replace(/\x1b\[\d+;\d+H/g, "")
    .replace(/\x1b\[\?25[hl]/g, "")
    .replace(/\x1b\[2J/g, "")
    .replace(/\x1b\[H/g, "");
  assert.ok(vis.includes("Claude is done"), "Pause-Hinweis gerendert");
  cleanup(ctx);
});

test("Hook 'play' setzt Pause nach Poll wieder auf", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  callHook("pause");
  const ctx = makeUI();
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.paused, true, "Pausiert nach pause");

  callHook("play");
  ctx.ui._refreshSignal();
  assert.equal(ctx.ui.signalPause, false);
  assert.equal(ctx.ui.paused, false, "Läuft wieder nach play");
  cleanup(ctx);
});

test("Hook 'status' meldet playing=false bei Pause", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  callHook("pause");
  const out = execFileSync("node", [SIGNAL, "status"], { env: process.env })
    .toString()
    .trim();
  const st = JSON.parse(out);
  assert.equal(st.playing, false);
  assert.equal(st.state, "PAUSE");
});

test("Tetris-Gravitation stoppt während Signal-Pause", async () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  callHook("play");
  const ctx = makeUI();
  ctx.ui._startGravity(); // Timer starten
  // Kurz laufen lassen
  await new Promise((r) => setTimeout(r, 200));
  const row1 = ctx.ui.game.current.row;
  callHook("pause");
  ctx.ui._refreshSignal();
  // Während Pause: kein Step mehr
  const rowAfterPause = ctx.ui.game.current.row;
  await new Promise((r) => setTimeout(r, 200));
  const rowStill = ctx.ui.game.current.row;
  assert.equal(rowStill, rowAfterPause, "Stück bewegt sich nicht während Pause");
  cleanup(ctx);
});

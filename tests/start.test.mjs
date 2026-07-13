// tests/start.test.mjs — start() läuft mit gemocktem TTY ohne Crash.

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tmpBase = path.join(os.tmpdir(), `ct-start-${process.pid}-${Date.now()}`);
process.env.CLAUDE_TETRIS_DIR = tmpBase;

const { TetrisTUI } = await import("../game/tui.mjs");

function makeSink() {
  return { _buf: "", write(s) { this._buf += s; } };
}

test("start() aktiviert TTY, rendert, läuft Gravitation (gemockt)", () => {
  const sink = makeSink();
  const origStdin = process.stdin;
  const fakeStdin = {
    _raw: false,
    setRawMode(v) { this._raw = v; },
    resume() {},
    on(ev, fn) { this._dataHandler = fn; },
    removeListener() {},
    write() {},
  };
  // process.stdin mit Fake ersetzen
  Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true });

  const ui = new TetrisTUI({ out: sink, signal: false });
  // start() darf nicht crashn, auch wenn stdin kein echtes TTY ist
  ui.start();
  assert.equal(ui.running, true, "läuft nach start()");
  assert.equal(fakeStdin._raw, true, "Raw-Mode aktiviert");
  assert.ok(sink._buf.includes("claude-tetris"), "Hat gerendert");

  // Gravitations-Timer läuft
  assert.ok(ui.gravityTimer !== null, "Gravitations-Timer gestartet");

  // Cleanup
  clearInterval(ui.gravityTimer);
  clearInterval(ui.signalTimer);
  process.stdin.setRawMode?.(false);
  Object.defineProperty(process, "stdin", { value: origStdin, configurable: true });
});

// tests/layout.test.mjs — Responsives Layout.
//
// Der Tetris-Pane ist oft schmal. Statt über den Rand zu malen fallen Panels
// nach Prioritaet weg. Diese Tests rendern in ein Raster und pruefen, dass
// nichts den Rahmen verlaesst oder ueberschreibt.

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { HEIGHT, WIDTH } from "../game/core.mjs";

process.env.CLAUDE_TETRIS_DIR = path.join(os.tmpdir(), `ct-layout-${process.pid}`);
const { TetrisTUI } = await import("../game/tui.mjs");

const seeded = (s0) => { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** Rendert und loest die ANSI-Positionierung in ein Zeichenraster auf. */
function render(cols, rows) {
  const sink = { _buf: "", columns: cols, rows, write(s) { this._buf += s; } };
  const ui = new TetrisTUI({ rng: seeded(7), signal: false, out: sink, highscore: false });
  ui.game.hold = "T";
  ui._render();

  const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
  let r = 1, c = 1, overflow = false;
  const re = /\x1b\[(\d+);(\d+)H|\x1b\[[0-9;?]*[A-Za-z]|([^\x1b]+)/g;
  let m;
  while ((m = re.exec(sink._buf))) {
    if (m[1]) { r = +m[1]; c = +m[2]; continue; }
    if (m[3] === undefined) continue;
    for (const ch of m[3]) {
      if (r >= 1 && r <= rows && c >= 1 && c <= cols) grid[r - 1][c - 1] = ch;
      else if (ch.trim()) overflow = true; // sichtbares Zeichen ausserhalb
      c++;
    }
  }
  return { ui, frame: ui._frame, lines: grid.map((row) => row.join("")), overflow };
}

const SIZES = [[120, 40], [80, 30], [60, 30], [42, 28], [30, 26], [24, 26]];

for (const [cols, rows] of SIZES) {
  test(`${cols}x${rows}: nichts wird ausserhalb des Terminals gezeichnet`, () => {
    const { overflow } = render(cols, rows);
    assert.equal(overflow, false);
  });

  test(`${cols}x${rows}: jede Zeile bleibt in der Terminalbreite`, () => {
    const { lines } = render(cols, rows);
    for (const line of lines) assert.ok(line.length <= cols, `zu lang: ${line.length}`);
  });
}

test("der Rahmen wird nie von Text ueberschrieben", () => {
  // Genau das ist passiert: die Hinweiszeile landete auf dem unteren Rahmen.
  for (const [cols, rows] of SIZES) {
    const { frame, lines } = render(cols, rows);
    if (frame.tooSmall) continue;
    const bottom = lines[frame.bottom - 1];
    assert.ok(
      bottom.includes("╚") && bottom.includes("╝"),
      `${cols}x${rows}: untere Rahmenecken fehlen -> ueberschrieben`
    );
    const top = lines[frame.top - 1];
    assert.ok(top.includes("╔") && top.includes("╗"), `${cols}x${rows}: obere Ecken fehlen`);
  }
});

test("der Rahmen passt immer ins Terminal", () => {
  for (const [cols, rows] of SIZES) {
    const { frame } = render(cols, rows);
    if (frame.tooSmall) continue;
    assert.ok(frame.right <= cols, `${cols}x${rows}: rechts raus (${frame.right})`);
    assert.ok(frame.bottom <= rows, `${cols}x${rows}: unten raus (${frame.bottom})`);
    assert.ok(frame.left >= 1 && frame.top >= 1);
  }
});

test("Panels fallen nach Prioritaet weg, das Spielfeld bleibt", () => {
  const wide = render(120, 40).frame;
  assert.equal(wide.showHold, true, "breit: HOLD sichtbar");
  assert.equal(wide.showPanel, true, "breit: NEXT sichtbar");

  const narrow = render(42, 28).frame;
  assert.equal(narrow.showHold, false, "schmal: HOLD faellt zuerst weg");
  assert.equal(narrow.showPanel, true, "schmal: NEXT bleibt");

  const tight = render(30, 26).frame;
  assert.equal(tight.showPanel, false, "sehr schmal: nur noch das Spielfeld");
  assert.equal(tight.tooSmall, false, "aber immer noch spielbar");
});

test("das Spielfeld wird in jeder spielbaren Groesse vollstaendig gezeichnet", () => {
  for (const [cols, rows] of SIZES) {
    const { frame, lines } = render(cols, rows);
    if (frame.tooSmall) continue;
    for (let r = 0; r < HEIGHT; r++) {
      const line = lines[frame.boardRow - 1 + r];
      const cells = line.slice(frame.boardCol - 1, frame.boardCol - 1 + WIDTH * 2);
      assert.equal(cells.length, WIDTH * 2, `${cols}x${rows}: Zeile ${r} unvollstaendig`);
      assert.notEqual(cells.trim(), "", `${cols}x${rows}: Zeile ${r} leer`);
    }
  }
});

test("zu kleines Terminal sagt es, statt zerrissen zu zeichnen", () => {
  const { frame, lines } = render(20, 12);
  assert.equal(frame.tooSmall, true);
  const text = lines.join("\n");
  assert.match(text, /too small/i);
  assert.match(text, /20x12/, "nennt die aktuelle Groesse");
});

test("HOLD zeigt das gehaltene Stueck an", () => {
  // Regression: die TUI las this.game.old statt this.game.hold, deshalb war
  // der Hold-Slot immer leer - auch nachdem die Engine repariert war.
  const { frame, lines } = render(120, 40);
  assert.equal(frame.showHold, true);
  const region = lines
    .slice(frame.boardRow - 1, frame.boardRow + 3)
    .map((l) => l.slice(frame.left, frame.left + frame.holdW))
    .join("");
  assert.match(region, /█/, "gehaltenes Stueck gezeichnet");
});

test("Statuszeile wird gekuerzt statt umgebrochen", () => {
  const { frame, lines } = render(30, 26);
  const msg = lines[frame.msgRow - 1];
  assert.ok(msg.length <= 30);
  assert.match(msg, /…/, "sichtbar gekuerzt");
});

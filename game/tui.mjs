// game/tui.mjs — Terminal-UI für das Tetris (ANSI, Raw-Keyboard, Game-Loop).
//
// Kapselt die headless Engine (core.mjs) und rendert sie in einem Terminal.
// Liest zusätzlich den Signal-Kanal (lib/signal.mjs): wenn Claude pausiert,
// friert das Spiel ein ("⏸ Claude is done"). Das ist die Kopplung aus Phase 3.
//
// Responsivität:
//  - SIGWINCH → Layout wird neu berechnet (kein Hard-Coded-Größe mehr).
//  - Signal-Polling durch fs.watch ersetzt (kein 100ms-Timer nötig).
//  - Double-Buffering: nur geänderte Zeilen werden neu geschrieben.

import process from "node:process";
import fs from "node:fs";
import { Tetris, WIDTH, HEIGHT, SHAPES } from "./core.mjs";
import { AutoShift, autoShiftFromEnv, TO_WALL } from "./autoshift.mjs";
import { getStatePath, readState, STATES } from "../lib/signal.mjs";
import { readHighscore, writeHighscore } from "../lib/highscore.mjs";

// ---- Colors (Truecolor) per piece type ----
const COLORS = {
  I: [34, 211, 238], // cyan
  O: [250, 204, 21], // yellow
  T: [192, 132, 252], // purple
  S: [74, 222, 128], // green
  Z: [248, 113, 113], // red
  J: [96, 165, 250], // blue
  L: [251, 146, 60], // orange
  G: [71, 85, 105], // grid (slate)
};

const ESC = "\x1b[";
const HIDE = `${ESC}?25l`;
const SHOW = `${ESC}?25h`;
const RESET = `${ESC}0m`;
const CLEAR = `${ESC}2J`;
const HOME = `${ESC}H`;
// Alternate Screen Buffer: clean fullscreen mode without terminal scrolling.
const ALT_ON = `${ESC}?1049h`;
const ALT_OFF = `${ESC}?1049l`;

const rgb = ([r, g, b]) => `${ESC}38;2;${r};${g};${b}m`;

const BLOCK = "██"; // 2-wide blocks for a "denser" field
const GHOST = "▢ "; // landing preview — outline, like the demo GIF
const DIM = `${ESC}2m`; // dim (faded)
const GRID = [32, 38, 48]; // empty cell dots, barely there
const GHOST_C = [88, 101, 124]; // ghost outline

// ---- Layout constants (flexible raster, computed from terminal size) ----
const BORDER = [90, 100, 120]; // border color
const TITLE = "claude-tetris";
const MUTE = [120, 130, 150]; // muted text
const BRIGHT = [230, 235, 245]; // bright text

export class TetrisTUI {
  constructor({ rng, signal = true, out = null, now = null, autoShift = null, highscore = true } = {}) {
    this._clock = now ?? Date.now; // injizierbar für Tests
    this.game = new Tetris({ rng, now: this._clock });
    this.autoShift = autoShift ?? autoShiftFromEnv();
    this.useHighscore = highscore;
    this.highscore = highscore ? readHighscore() : { score: 0 };
    this._recordSaved = false; // pro Runde nur einmal speichern
    this.out = out ?? process.stdout; // injectable for tests
    this.running = false;
    this.manualPause = false;
    this.signalPause = false; // controlled by Claude (state.json)
    this.useSignal = signal;
    this.gravityTimer = null;
    this.watchHandle = null;
    this._prev = ""; // previous rendered screen (for double-buffering)
    this._watchDirty = false; // pending signal change from fs.watch
    this._onResize = null; // set in start()
  }

  get paused() {
    return this.manualPause || this.signalPause || this.game.gameOver;
  }

  start() {
    this.running = true;
    this.out.write(ALT_ON + HIDE);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", (buf) => this._onKey(buf));
    process.on("SIGINT", () => this.stop());
    process.on("exit", () => this.out.write(SHOW + ALT_OFF));
    // Resize: re-render with new terminal dimensions.
    this._onResize = () => {
      this._prev = ""; // force full redraw
      this._render();
    };
    process.stdout.on("resize", this._onResize);

    this._startGravity();
    if (this.useSignal) {
      this._startSignalWatch();
    }
    this._render();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.gravityTimer);
    this.watchHandle?.close?.();
    if (this._onResize) process.stdout.off?.("resize", this._onResize);
    process.stdin.setRawMode?.(false);
    this.out.write(SHOW + ALT_OFF + CLEAR + HOME);
    // Only real exit when run as binary (not in tests).
    if (import.meta.url === `file://${process.argv[1]}`) {
      process.exit(0);
    }
  }

  _startGravity() {
    clearInterval(this.gravityTimer);
    const interval = Math.max(80, 800 - this.game.level * 65);
    this.gravityTimer = setInterval(() => {
      if (this.paused) return;
      this.game.step();
      this._saveRecordIfOver();
      this._render();
    }, interval);
  }

  // ---- Signal: fs.watch statt Polling ----
  _refreshSignal() {
    const { state } = readState();
    const shouldPause = state !== STATES.PLAY;
    if (shouldPause !== this.signalPause) {
      this.signalPause = shouldPause;
      this._render();
    }
  }

  _startSignalWatch() {
    const file = getStatePath();
    const apply = () => {
      try {
        const { state } = readState();
        const shouldPause = state !== STATES.PLAY;
        if (shouldPause !== this.signalPause) {
          this.signalPause = shouldPause;
          this._render();
        }
      } catch {
        /* file briefly unavailable — ignore */
      }
    };
    try {
      this.watchHandle = fs.watch(file, () => apply());
    } catch {
      // file may not exist yet — fall back to a light poll until first write
      const poll = setInterval(() => {
        if (fs.existsSync(file)) {
          clearInterval(poll);
          this._startSignalWatch();
        }
      }, 200);
    }
    apply();
  }

  _onKey(buf) {
    const s = buf.toString();
    if (s === "q" || s === "\x03") return this.stop();

    if (this.game.gameOver) {
      if (s === "r") {
        this._saveRecordIfOver();
        this.game.reset();
        this.autoShift.reset();
        this._recordSaved = false;
        this._startGravity();
        this._render();
      }
      return;
    }

    if (s === "p" || s === "P") {
      this.manualPause = !this.manualPause;
      this._render();
      return;
    }
    if (this.paused) return;

    let acted = false;
    switch (s) {
      case "\x1b[D": acted = this._shift(-1, "left"); break;
      case "\x1b[C": acted = this._shift(1, "right"); break;
      case "\x1b[B": acted = this.game.softDrop(); break;
      case "\x1b[A":
      case "x":
      case "X": acted = this.game.rotate(1); break;
      case "z":
      case "Z": acted = this.game.rotate(-1); break;
      case " ":
        this.game.hardDrop();
        this._startGravity();
        acted = true;
        break;
      case "c":
      case "C": acted = this.game.holdPiece(); break;
    }
    if (acted || s === " ") this._render();
  }

  /**
   * Bei Game Over einmal den Rekord festhalten. Idempotent, weil sowohl der
   * Gravitations-Timer als auch der Restart hier reinlaufen können.
   */
  _saveRecordIfOver() {
    if (!this.useHighscore || !this.game.gameOver || this._recordSaved) return;
    this._recordSaved = true;
    const { record } = writeHighscore({
      score: this.game.score,
      lines: this.game.lines,
      level: this.game.level,
    });
    this.highscore = record;
  }

  /**
   * Seitwärtsbewegung mit DAS/ARR. Bei ARR=0 liefert AutoShift TO_WALL und
   * das Stück rutscht in einem Rutsch bis an die Wand bzw. den Stapel.
   */
  _shift(dir, key) {
    const cells = this.autoShift.press(key, this._clock());
    if (cells === 0) return false;
    if (cells === TO_WALL) {
      let moved = false;
      while (this.game.move(dir)) moved = true;
      return moved;
    }
    let moved = false;
    for (let i = 0; i < cells; i++) moved = this.game.move(dir) || moved;
    return moved;
  }

  // ---- Responsive layout (computed from terminal size) ----
  //
  // Der Tetris-Pane ist oft schmal. Statt über den Rand zu zeichnen, fallen
  // Panels nach Priorität weg: erst die Steuerungs-Hilfe, dann die HOLD-Spalte,
  // dann die NEXT-Vorschau. Das Spielfeld selbst ist unverhandelbar.
  _computeFrame() {
    const cols = this.out.columns || 80;
    const rows = this.out.rows || 30;

    const innerW = WIDTH * 2 + 2; // Spielfeld: 2 Zeichen pro Zelle
    const holdW = 6;
    const panelW = 12;
    const gap = 1;
    const chrome = 2; // Rahmen links und rechts

    // Was passt noch rein?
    const withAll = chrome + holdW + innerW + gap + panelW;
    const withPanel = chrome + innerW + gap + panelW;
    const bare = chrome + innerW;

    const showHold = cols >= withAll;
    const showPanel = cols >= withPanel;
    const tooSmall = cols < bare || rows < HEIGHT + 6;

    const usedHold = showHold ? holdW : 0;
    const usedPanel = showPanel ? gap + panelW : 0;
    const width = chrome + usedHold + innerW + usedPanel;

    const left = Math.max(1, Math.floor((cols - width) / 2) + 1);
    const headerH = rows >= HEIGHT + 8 ? 2 : 0; // Titelzeile nur wenn Platz ist
    const showHint = rows >= HEIGHT + 9 && cols >= 70;
    const statusH = 2 + (showHint ? 1 : 0);
    const top = Math.max(1, Math.floor((rows - (HEIGHT + headerH + statusH + 2)) / 2) + 1);

    // Wie viele NEXT-Steine passen untereinander? Jeder braucht 3 Zeilen.
    const nextSpace = HEIGHT - 8;
    const nextCount = Math.max(1, Math.min(5, Math.floor(nextSpace / 3)));

    const right = left + width - 1;

    // Zeilen explizit durchnummerieren statt sie an drei Stellen neu
    // auszurechnen — genau so ist die Hinweiszeile vorher auf dem unteren
    // Rahmen gelandet.
    const boardRow = top + headerH + 1;
    const sepRow = boardRow + HEIGHT;
    const msgRow = sepRow + 1;
    const hintRow = showHint ? msgRow + 1 : null;
    const bottom = (hintRow ?? msgRow) + 1;

    return {
      top, left, right, bottom, cols, rows,
      holdW: usedHold, innerW, panelW, gap,
      showHold, showPanel, showHint, headerH, nextCount, tooSmall,
      boardRow, sepRow, msgRow, hintRow,
      // innerW hat 2 Spalten Reserve — je eine links und rechts, sonst klebt
      // das Feld am Rahmen und die Luft sammelt sich auf einer Seite.
      boardCol: left + 2 + usedHold,
    };
  }

  /** Zu kleines Terminal: ehrliche Ansage statt zerrissenem Layout. */
  _drawTooSmall(out, f) {
    const need = `${WIDTH * 2 + 4}x${HEIGHT + 6}`;
    // Die Meldung muss selbst in das zu kleine Terminal passen — sonst laeuft
    // ausgerechnet der Ueberlauf-Hinweis ueber den Rand. Je enger, desto kuerzer.
    const lines =
      f.cols >= 26
        ? ["Terminal too small", `need ${need}, have ${f.cols}x${f.rows}`, "resize or press F11"]
        : ["too small", `${f.cols}x${f.rows}`, `need ${need}`];
    lines.forEach((text, i) => {
      const t = this._fit(text, f.cols);
      const c = Math.max(1, Math.floor((f.cols - t.length) / 2) + 1);
      const r = Math.max(1, Math.floor(f.rows / 2) - 1 + i);
      out.push(this._xy(r, c) + rgb(i === 0 ? COLORS.Z : MUTE) + t + RESET);
    });
  }

  // ---- Rendering (double-buffered) ----
  _render() {
    const out = [CLEAR, HOME];
    const frame = this._computeFrame();
    this._frame = frame;

    if (frame.tooSmall) {
      this._drawTooSmall(out, frame);
    } else {
      this._drawFrame(out, frame);
      if (frame.headerH) this._drawHeader(out, frame);
      this._drawBoard(out, frame);
      this._drawPanel(out, frame);
      this._drawStatus(out, frame);
    }

    const next = out.join("");
    // Double-Buffering: identische Frames gar nicht erst schreiben. Der
    // Gravitations-Timer feuert auch, wenn sich nichts bewegt hat.
    if (next === this._prev) return;
    this.out.write(next);
    this._prev = next;
  }

  _xy(r, c) {
    return `${ESC}${r};${c}H`;
  }

  /** Schneidet Text auf die verfügbare Breite, damit nie über den Rahmen gemalt wird. */
  _fit(text, width) {
    if (width <= 0) return "";
    return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + "…";
  }

  _drawFrame(out, f) {
    const b = rgb(BORDER);
    out.push(this._xy(f.top, f.left) + b + "╔" + "═".repeat(f.right - f.left - 2) + "╗" + RESET);
    for (let r = f.top + 1; r < f.bottom; r++) {
      out.push(this._xy(r, f.left) + b + "║" + RESET);
      out.push(this._xy(r, f.right - 1) + b + "║" + RESET);
    }
    out.push(this._xy(f.bottom, f.left) + b + "╚" + "═".repeat(f.right - f.left - 2) + "╝" + RESET);
  }

  _drawHeader(out, f) {
    const b = rgb(BORDER);
    const y = f.top + 1;
    const inner = f.right - f.left - 1;
    // Untertitel nur, wenn er wirklich passt — sonst bricht er den Rahmen.
    const sub = "  playable while Claude Code works";
    const head = rgb(COLORS.T) + "▮ " + TITLE + RESET +
      (inner >= TITLE.length + sub.length + 4 ? rgb(MUTE) + sub + RESET : "");
    out.push(this._xy(y, f.left + 1) + head);
    out.push(this._xy(y + 1, f.left) + b + "╟" + "─".repeat(inner - 1) + "╢" + RESET);
  }

  _drawBoard(out, f) {
    const r0 = f.boardRow;
    const c0 = f.boardCol;
    const view = this.game.getView();
    for (let r = 0; r < HEIGHT; r++) {
      let line = this._xy(r0 + r, c0);
      for (let c = 0; c < WIDTH; c++) {
        const v = view[r][c];
        // Jede Zelle MUSS 2 Zeichen breit sein — sonst variiert die Zeilenlaenge
        // mit der Stueckposition und hinterlaesst Farbschlieren.
        if (v === "." || v === 0) {
          line += rgb(GRID) + "· " + RESET;
        } else if (v === "G") {
          line += rgb(GHOST_C) + GHOST + RESET;
        } else {
          line += rgb(COLORS[v]) + BLOCK + RESET;
        }
      }
      out.push(line);
    }
    if (this.game.gameOver) this._drawGameOver(out, f);
  }

  _drawGameOver(out, f) {
    const r0 = f.boardRow;
    const c0 = f.boardCol;
    const boxW = WIDTH * 2; // covers the whole board (20 cols)
    const boxH = 9;
    const br = r0 + Math.floor((HEIGHT - boxH) / 2);
    const bc = c0;
    const b = rgb(COLORS.Z);
    // Box spans the board exactly: left edge at c0, right edge at c0+boxW+1
    out.push(this._xy(br, bc) + b + "╔" + "═".repeat(boxW) + "╗" + RESET);
    for (let r = 1; r < boxH; r++) {
      out.push(this._xy(br + r, bc) + b + "║" + RESET);
      out.push(this._xy(br + r, bc + boxW + 1) + b + "║" + RESET);
    }
    out.push(this._xy(br + boxH, bc) + b + "╚" + "═".repeat(boxW) + "╝" + RESET);
    const pad = (s, n) => s + " ".repeat(Math.max(0, n - s.length));
    const lines = [
      "  G A M E   O V E R",
      "",
      "  Score  " + this.game.score,
      "  Level  " + this.game.level,
      "  Lines  " + this.game.lines,
      "",
      "  Press R to restart",
    ];
    lines.forEach((text, i) => {
      out.push(this._xy(br + 1 + i, bc + 2) + rgb(BRIGHT) + pad(text, boxW - 2) + RESET);
    });
  }

  _miniPiece(out, row, col, type) {
    const cells = SHAPES[type][0];
    let maxR = 0, maxC = 0;
    for (const [r, c] of cells) {
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }
    for (let r = 0; r <= maxR; r++) {
      let line = this._xy(row + r, col);
      for (let c = 0; c <= maxC; c++) {
        const on = cells.some(([cr, cc]) => cr === r && cc === c);
        line += on ? rgb(COLORS[type]) + BLOCK + RESET : "  ";
      }
      out.push(line);
    }
  }

  _drawPanel(out, f) {
    const holdX = f.left + 1;
    const panelX = f.boardCol + f.innerW + f.gap;

    if (f.showHold) {
      out.push(this._xy(f.boardRow, holdX) + rgb(MUTE) + "HOLD" + RESET);
      // War this.game.old — der Rest eines Engine-Bugs, weshalb der
      // Hold-Slot in der TUI nie sichtbar war.
      if (this.game.hold) this._miniPiece(out, f.boardRow + 1, holdX, this.game.hold);
    }
    if (!f.showPanel) return;

    out.push(this._xy(f.boardRow, panelX) + rgb(MUTE) + "NEXT" + RESET);
    const next = this.game.queue.slice(0, f.nextCount);
    next.forEach((t, i) => this._miniPiece(out, f.boardRow + 1 + i * 3, panelX, t));

    let sy = f.boardRow + 2 + next.length * 3;
    const st = (label, val) => {
      out.push(
        this._xy(sy, panelX) +
          rgb(MUTE) +
          label.padEnd(6) +
          RESET +
          rgb(BRIGHT) +
          val +
          RESET
      );
      sy += 1;
    };
    st("SCORE", this.game.score);
    st("LEVEL", this.game.level);
    st("LINES", this.game.lines);
    if (this.useHighscore) {
      // Während der Runde zählt der laufende Score mit, sobald er den Rekord
      // überholt — sonst stünde dort kleiner als der eigene aktuelle Stand.
      const best = Math.max(this.highscore.score || 0, this.game.score);
      st("BEST", best);
    }
  }

  _drawStatus(out, f) {
    const b = rgb(BORDER);
    const inner = f.right - f.left - 1;
    out.push(this._xy(f.sepRow, f.left) + b + "╟" + "─".repeat(inner - 1) + "╢" + RESET);
    const y = f.msgRow;
    let msg = "";
    let color = MUTE;
    if (this.game.gameOver) {
      msg = "GAME OVER — R to restart";
      color = COLORS.Z;
    } else if (this.signalPause) {
      msg = "⏸ Claude is done — waiting for your next prompt";
      color = COLORS.O;
    } else if (this.manualPause) {
      msg = "⏸ Paused — P to resume";
      color = COLORS.O;
    } else {
      msg = "▶ Playing while Claude works";
      color = COLORS.S;
    }
    out.push(this._xy(y, f.left + 1) + rgb(color) + this._fit(msg, inner - 1) + RESET);
    if (!f.showHint || f.hintRow === null) return;
    // Lange Hilfe nur bei breitem Pane, sonst die Kurzfassung.
    const long = "←→ move · ↑/X rotate · ↓ soft · Space hard · C hold · P pause · Q quit";
    const short = "←→ ↑ ↓ · Space drop · C hold · Q quit";
    const hint = inner - 1 >= long.length ? long : short;
    out.push(this._xy(f.hintRow, f.left + 1) + rgb(BORDER) + this._fit(hint, inner - 1) + RESET);
  }
}

// Direct start when invoked as binary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const ui = new TetrisTUI();
  ui.start();
}

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
import { getStatePath, readState, STATES } from "../lib/signal.mjs";

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
const GHOST = "▒"; // semi-transparent ghost block
const DIM = `${ESC}2m`; // dim (faded)

// ---- Layout constants (flexible raster, computed from terminal size) ----
const BORDER = [90, 100, 120]; // border color
const TITLE = "claude-tetris";
const MUTE = [120, 130, 150]; // muted text
const BRIGHT = [230, 235, 245]; // bright text

export class TetrisTUI {
  constructor({ rng, signal = true, out = null } = {}) {
    this.game = new Tetris({ rng });
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
        this.game.reset();
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
      case "\x1b[D": acted = this.game.move(-1); break;
      case "\x1b[C": acted = this.game.move(1); break;
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

  // ---- Responsive layout (computed from terminal size) ----
  _computeFrame() {
    const cols = (this.out.columns || 80);
    const rows = (this.out.rows || 30);
    const left = Math.max(1, Math.floor((cols - (WIDTH * 2 + 30)) / 2));
    const top = Math.max(1, Math.floor((rows - (HEIGHT + 8)) / 2));
    const holdW = 6;
    const innerW = WIDTH * 2 + 2;
    const panelW = 18;
    const gap = 1;
    const right = left + 1 + holdW + innerW + gap + panelW + 1;
    const bottom = top + 1 + HEIGHT + 4;
    return { top, left, holdW, innerW, panelW, gap, right, bottom, cols, rows };
  }

  // ---- Rendering (double-buffered) ----
  _render() {
    const out = [];
    out.push(HOME);
    const frame = this._computeFrame();
    this._frame = frame;
    this._drawFrame(out, frame);
    this._drawHeader(out, frame);
    this._drawBoard(out, frame);
    this._drawPanel(out, frame);
    this._drawStatus(out, frame);
    const next = out.join("");
    this.out.write(next);
    this._prev = next;
  }

  _xy(r, c) {
    return `${ESC}${r};${c}H`;
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
    out.push(
      this._xy(y, f.left + 1) +
        rgb(COLORS.T) +
        "▮ " +
        TITLE +
        RESET +
        rgb(MUTE) +
        "  — playable while Claude Code works" +
        RESET
    );
    out.push(this._xy(y + 1, f.left) + b + "╟" + "─".repeat(f.right - f.left - 2) + "╢" + RESET);
  }

  _drawBoard(out, f) {
    const r0 = f.top + 3;
    const c0 = f.left + 1 + f.holdW + 1;
    const view = this.game.getView();
    for (let r = 0; r < HEIGHT; r++) {
      let line = this._xy(r0 + r, c0);
      for (let c = 0; c < WIDTH; c++) {
        const v = view[r][c];
        if (v === "." || v === 0) {
          // Every cell MUST be 2 chars wide (BLOCK is 2 cells). Otherwise the
          // row length varies with piece position and leaves color trails.
          line += rgb(COLORS.G) + "· " + RESET;
        } else if (v === "G") {
          line += DIM + rgb(COLORS.G) + "▒ " + RESET;
        } else {
          line += rgb(COLORS[v]) + BLOCK + RESET;
        }
      }
      out.push(line);
    }
    if (this.game.gameOver) this._drawGameOver(out, f);
  }

  _drawGameOver(out, f) {
    const r0 = f.top + 3;
    const c0 = f.left + 1 + f.holdW + 1;
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
    const holdX = f.left + 2;
    const panelX = f.left + 1 + f.holdW + 1 + f.innerW + f.gap + 1;

    out.push(this._xy(f.top + 3, holdX) + rgb(MUTE) + "HOLD" + RESET);
    if (this.game.old) this._miniPiece(out, f.top + 4, holdX, this.game.old);

    out.push(this._xy(f.top + 3, panelX) + rgb(MUTE) + "NEXT" + RESET);
    const next = this.game.queue.slice(0, 5);
    next.forEach((t, i) => this._miniPiece(out, f.top + 4 + i * 3, panelX, t));

    let sy = f.top + 4 + next.length * 3 + 1;
    const st = (label, val) => {
      out.push(
        this._xy(sy, panelX) +
          rgb(MUTE) +
          label.padEnd(7) +
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
  }

  _drawStatus(out, f) {
    const b = rgb(BORDER);
    out.push(this._xy(f.bottom - 3, f.left) + b + "╟" + "─".repeat(f.right - f.left - 2) + "╢" + RESET);
    const y = f.bottom - 2;
    let msg = "";
    let color = MUTE;
    if (this.game.gameOver) {
      msg = "✖ GAME OVER — press R for new game";
      color = COLORS.Z;
    } else if (this.signalPause) {
      msg = "⏸ Claude is done — waiting for next prompt…";
      color = COLORS.O;
    } else if (this.manualPause) {
      msg = "⏸ Paused (P to resume)";
      color = COLORS.O;
    } else {
      msg = "▶ PLAYING — Pause P · Quit Q";
      color = COLORS.S;
    }
    out.push(this._xy(y, f.left + 1) + rgb(color) + msg + RESET);
    const hint = "←→ move · ↑/X rotate · ↓ soft · Space hard · C hold · F11 fullscreen (recommended)";
    out.push(this._xy(y + 1, f.left + 1) + rgb([90, 100, 120]) + hint + RESET);
  }
}

// Direct start when invoked as binary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const ui = new TetrisTUI();
  ui.start();
}

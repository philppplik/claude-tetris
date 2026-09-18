#!/usr/bin/env node
// tools/record-demo.mjs — Erzeugt das Demo-GIF fürs README.
//
// Reproduzierbar statt einmalig von Hand aufgenommen: fester Seed, feste
// Eingabefolge. Nach einer UI-Änderung einfach neu laufen lassen.
//
//   node tools/record-demo.mjs            -> assets/demo.gif
//   node tools/record-demo.mjs --frames   -> nur PNGs, kein ffmpeg
//
// Braucht ffmpeg im PATH (für die GIF-Palette und die Textbeschriftungen).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Tetris, WIDTH, HEIGHT } from "../game/core.mjs";
import { Canvas, drawNumber, encodePNG } from "./png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets", "demo.gif");
const FPS = 12;

// ---- Farben (identisch zur TUI) ----
const C = {
  bg: [13, 17, 23],
  panel: [22, 27, 34],
  border: [48, 54, 61],
  grid: [28, 33, 40],
  text: [230, 235, 245],
  mute: [125, 133, 150],
  accent: [192, 132, 252],
  ghost: [71, 85, 105],
  I: [34, 211, 238], O: [250, 204, 21], T: [192, 132, 252],
  S: [74, 222, 128], Z: [248, 113, 113], J: [96, 165, 250], L: [251, 146, 60],
};

// ---- Layout ----
const CELL = 18;
const PAD = 16;
const BOARD_W = WIDTH * CELL;
const BOARD_H = HEIGHT * CELL;
const SIDE = 108;
const W = PAD * 3 + SIDE + BOARD_W + SIDE + PAD;
// Genug Luft oben, damit Titelzeile und die HOLD/NEXT-Labels sich nicht
// überlappen — beide setzt ffmpeg, kollidieren wäre nur im GIF sichtbar.
const BOARD_Y = PAD + 48;
const H = BOARD_Y + BOARD_H + 26;
const BOARD_X = PAD * 2 + SIDE;

function drawFrame(game, { paused = false, flash = null } = {}) {
  const c = new Canvas(W, H, C.bg);

  // Spielfeld
  c.fill(BOARD_X - 2, BOARD_Y - 2, BOARD_W + 4, BOARD_H + 4, C.border);
  c.fill(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, C.panel);
  for (let y = 0; y <= HEIGHT; y++) {
    c.fill(BOARD_X, BOARD_Y + y * CELL, BOARD_W, 1, C.grid);
  }
  for (let x = 0; x <= WIDTH; x++) {
    c.fill(BOARD_X + x * CELL, BOARD_Y, 1, BOARD_H, C.grid);
  }

  const view = game.getView();
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = view[y][x];
      if (!v) continue;
      const px = BOARD_X + x * CELL;
      const py = BOARD_Y + y * CELL;
      if (v === "G") {
        c.stroke(px + 2, py + 2, CELL - 4, CELL - 4, C.ghost, 2);
      } else {
        const col = flash?.includes(y) ? C.text : C[v];
        c.fill(px + 1, py + 1, CELL - 2, CELL - 2, col);
        c.fill(px + 1, py + 1, CELL - 2, 3, lighten(col));
      }
    }
  }

  // HOLD links
  const hx = PAD;
  c.fill(hx, BOARD_Y, SIDE - 12, 74, C.panel);
  c.stroke(hx, BOARD_Y, SIDE - 12, 74, C.border, 1);
  if (game.hold) miniPiece(c, game.hold, hx + 16, BOARD_Y + 22);

  // NEXT rechts
  const nx = BOARD_X + BOARD_W + PAD;
  c.fill(nx, BOARD_Y, SIDE - 12, 172, C.panel);
  c.stroke(nx, BOARD_Y, SIDE - 12, 172, C.border, 1);
  game.queue.slice(0, 4).forEach((t, i) => miniPiece(c, t, nx + 16, BOARD_Y + 22 + i * 40));

  // Zahlen (Labels setzt ffmpeg)
  const sy = BOARD_Y + 200;
  drawNumber(c, game.score, nx + 4, sy, C.text, 3);
  drawNumber(c, game.level, nx + 4, sy + 34, C.text, 3);
  drawNumber(c, game.lines, nx + 4, sy + 68, C.text, 3);

  // Statusleiste unten
  const barY = BOARD_Y + BOARD_H + 8;
  c.fill(BOARD_X, barY, BOARD_W, 3, paused ? C.accent : C.I);

  if (paused) {
    // Gleichmäßig abblenden statt Streifen — sonst sieht der Stapel zerhackt aus.
    c.dim(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, 0.72, C.bg);
    const by = BOARD_Y + Math.round(BOARD_H / 2) - 26;
    c.fill(BOARD_X + 6, by, BOARD_W - 12, 52, C.panel);
    c.stroke(BOARD_X + 6, by, BOARD_W - 12, 52, C.accent, 2);
  }
  return c;
}

function lighten([r, g, b]) {
  return [Math.min(255, r + 45), Math.min(255, g + 45), Math.min(255, b + 45)];
}

const MINI = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]], O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

function miniPiece(c, type, x, y) {
  const s = 11;
  for (const [cx, cy] of MINI[type]) {
    c.fill(x + cx * s, y + cy * s, s - 2, s - 2, C[type]);
  }
}

// ---- Das Drehbuch ----
// Deterministisch: fester Seed, feste Zugfolge. Das GIF sieht bei jedem Lauf
// gleich aus, Diffs am Bild sind damit echte UI-Änderungen.
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Ein glaubwürdiger Mid-Game-Stapel mit einem offenen Schacht in Spalte 9. */
function buildStack(game) {
  const rows = [
    [1, 1, 1, 0, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  ];
  const palette = ["J", "L", "S", "Z", "T", "O", "J", "L", "S", "Z"];
  rows.forEach((row, i) => {
    const y = HEIGHT - rows.length + i;
    row.forEach((on, x) => {
      if (on) game.board[y][x] = palette[(x + i * 3) % palette.length];
    });
  });
}

function record() {
  const frames = [];
  let clock = 0;
  const game = new Tetris({ rng: seeded(20260918), now: () => clock });
  buildStack(game);

  const snap = (opts) => frames.push(drawFrame(game, opts));
  const beat = (n = 1, opts) => { for (let i = 0; i < n; i++) { clock += 80; snap(opts); } };

  /** Stück sichtbar fallen lassen und festsetzen; räumt volle Reihen mit Blitz. */
  function drop() {
    while (!game._collides(game.current, 1, 0, 0)) {
      game.current.row += 1;
      game.score += 2; // wie hardDrop
      clock += 45;
      snap();
    }
    // Einbetten, dann prüfen was voll ist — der Blitz muss VOR dem Räumen kommen.
    for (const [r, cc] of game._cells(game.current)) {
      if (r >= 0 && r < HEIGHT) game.board[r][cc] = game.current.type;
    }
    const full = [];
    for (let y = 0; y < HEIGHT; y++) if (game.board[y].every((v) => v !== 0)) full.push(y);
    if (full.length) {
      for (let i = 0; i < 3; i++) { snap({ flash: full }); snap(); }
      const cleared = game._clearLines();
      game.lines += cleared;
      game.score += { 1: 100, 2: 300, 3: 500, 4: 800 }[cleared] * (game.level + 1);
      game.level = Math.floor(game.lines / 10);
    }
    game._clearLockState();
    game.spawn();
    game.canHold = true;
    beat(2);
  }

  const nudge = (dir, times) => {
    for (let i = 0; i < times; i++) { game.move(dir); clock += 55; snap(); }
  };

  // 1. Ein T-Stück einsetzen: bewegen, drehen, Ghost sichtbar.
  game.current = { type: "T", rot: 0, row: 0, col: 3 };
  beat(3);
  nudge(-1, 3);
  game.rotate(1); clock += 90; snap(); beat(2);
  nudge(1, 2);
  drop();

  // 2. Hold zeigen.
  game.holdPiece(); clock += 120; beat(4);

  // 3. Das I-Stück senkrecht in den Schacht: vier Reihen auf einmal.
  game.current = { type: "I", rot: 0, row: 0, col: 3 };
  beat(2);
  game.rotate(1); clock += 90; snap(); beat(2);
  nudge(1, 5);
  beat(2);
  drop();
  beat(6);

  // 4. Finale: Claude ist fertig, das Spiel friert ein.
  const pauseStart = frames.length;
  for (let i = 0; i < 24; i++) frames.push(drawFrame(game, { paused: true }));

  return { frames, pauseStart, pauseEnd: frames.length - 1 };
}

// ---- Ausgabe ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ct-demo-"));
const { frames, pauseStart, pauseEnd } = record();
frames.forEach((c, i) => {
  fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, "0")}.png`), encodePNG(c));
});
console.log(`${frames.length} Frames -> ${dir}`);

if (process.argv.includes("--frames")) process.exit(0);

const FONT = findFont();
const label = (text, x, y, size, color, extra = "") =>
  `drawtext=fontfile='${FONT}':text='${text}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}${extra}`;

const nx = BOARD_X + BOARD_W + PAD;
const sy = BOARD_Y + 200;
const filters = [
  label("claude-tetris", PAD, PAD, 18, "0xE6EBF5"),
  label("Tetris while Claude cooks", PAD + 142, PAD + 5, 12, "0x7D8596"),
  label("HOLD", PAD, BOARD_Y - 16, 11, "0x7D8596"),
  label("NEXT", nx, BOARD_Y - 16, 11, "0x7D8596"),
  label("SCORE", nx + 4, sy - 14, 10, "0x7D8596"),
  label("LEVEL", nx + 4, sy + 20, 10, "0x7D8596"),
  label("LINES", nx + 4, sy + 54, 10, "0x7D8596"),
  // Über dem Spielfeld zentriert statt fest positioniert — sonst stößt der
  // Text je nach Schriftbreite an den Rahmen.
  label(
    "Claude is done",
    `${BOARD_X}+(${BOARD_W}-text_w)/2`,
    BOARD_Y + Math.round(BOARD_H / 2) - 15,
    14,
    "0xC084FC",
    `:enable='between(n\\,${pauseStart}\\,${pauseEnd})'`
  ),
  label(
    "waiting for your next prompt",
    `${BOARD_X}+(${BOARD_W}-text_w)/2`,
    BOARD_Y + Math.round(BOARD_H / 2) + 3,
    10,
    "0x7D8596",
    `:enable='between(n\\,${pauseStart}\\,${pauseEnd})'`
  ),
  // Zwei Durchgänge: erst optimale Palette, dann anwenden. Ohne das wird ein
  // GIF aus Volltonflächen sichtbar schmutzig.
  "split[a][b]",
].join(",");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const r = spawnSync(
  "ffmpeg",
  [
    "-y", "-framerate", String(FPS),
    "-i", path.join(dir, "f%04d.png"),
    "-filter_complex",
    `${filters};[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
    "-loop", "0",
    OUT,
  ],
  { encoding: "utf8" }
);
if (r.status !== 0) {
  console.error(r.stderr?.split("\n").slice(-15).join("\n"));
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`${path.relative(ROOT, OUT)} geschrieben (${kb} kB)`);

function findFont() {
  const candidates = [
    "C:/Windows/Fonts/consola.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error("Keine Monospace-Schrift gefunden. Pfad in findFont() ergänzen.");
    process.exit(1);
  }
  // ffmpeg-Filtersyntax: der Doppelpunkt in "C:/..." trennt sonst Optionen.
  // Genau EIN Backslash davor — spawnSync geht ohne Shell, es gibt also keine
  // zweite Ebene, die noch einmal auspackt.
  return found.replace(/\\/g, "/").replace(/:/g, "\\:");
}

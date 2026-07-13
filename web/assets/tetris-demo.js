/* =========================================================
   tetris-demo.js — a self-contained, playable canvas Tetris.
   Used by #hero-canvas (small, ambient) and #demo-canvas
   (full game with HUD + game-over overlay).
   ========================================================= */

const SHAPES = {
  I: [[1,0],[1,1],[1,2],[1,3]],
  O: [[0,0],[0,1],[1,0],[1,1]],
  T: [[0,1],[1,0],[1,1],[1,2]],
  S: [[0,1],[0,2],[1,0],[1,1]],
  Z: [[0,0],[0,1],[1,1],[1,2]],
  J: [[0,0],[1,0],[1,1],[1,2]],
  L: [[0,2],[1,0],[1,1],[1,2]],
};
const COLORS = {
  I:"#34d3ee", O:"#facc15", T:"#c084fc", S:"#4ade80",
  Z:"#f87171", J:"#60a5fa", L:"#fb923c",
};
const TYPES = ["I","O","T","S","Z","J","L"];

class DemoGame {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = opts.cell || 26;
    this.cols = opts.cols || 10;
    this.rows = opts.rows || 20;
    this.onScore = opts.onScore || (() => {});
    this.onGameOver = opts.onGameOver || (() => {});
    this.ambient = opts.ambient || false; // hero mode: slower, no HUD
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
    this.bag = [];
    this.score = 0; this.lines = 0; this.level = 0;
    this.gameOver = false; this.paused = false;
    this.hold = null; this.canHold = true;
    this.queue = [];
    this._refill();
    this.spawn();
    this._loop();
  }

  _refill() {
    while (this.queue.length < 6) {
      if (this.bag.length === 0) {
        this.bag = [...TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  spawn(type = null) {
    const t = type ?? this.queue.shift();
    this._refill();
    const col = Math.floor((this.cols - 2) / 2);
    this.cur = { type: t, rot: 0, row: 0, col };
    if (this._collides(this.cur, 0, 0, 0)) this.gameOver = true;
  }

  _cells(p, dRow = 0, dCol = 0, dRot = 0) {
    const shape = SHAPES[p.type];
    const rot = (p.rot + dRot + 4) % 4;
    return shape.map(([r, c]) => {
      // rotate around center for a T-like feel (good enough visually)
      let nr = r, nc = c;
      for (let i = 0; i < rot; i++) { [nr, nc] = [nc, 1 - nr]; }
      return [p.row + nr + dRow, p.col + nc + dCol];
    });
  }

  _collides(p, dRow, dCol, dRot) {
    for (const [r, c] of this._cells(p, dRow, dCol, dRot)) {
      if (c < 0 || c >= this.cols || r >= this.rows) return true;
      if (r >= 0 && this.board[r][c]) return true;
    }
    return false;
  }

  move(dir) { if (!this._canAct()) return; if (!this._collides(this.cur, 0, dir, 0)) this.cur.col += dir; }
  rotate(dir) {
    if (!this._canAct()) return;
    const from = this.cur.rot, to = (from + dir + 4) % 4;
    for (const [x, y] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
      if (!this._collides(this.cur, y, x, dir)) { this.cur.col += x; this.cur.row += y; this.cur.rot = to; return; }
    }
  }
  softDrop() {
    if (!this._canAct()) return;
    if (!this._collides(this.cur, 1, 0, 0)) { this.cur.row++; this.score += 1; }
    else this._lock();
  }
  hardDrop() {
    if (!this._canAct()) return;
    let d = 0; while (!this._collides(this.cur, d + 1, 0, 0)) d++;
    this.cur.row += d; this.score += d * 2; this._lock();
  }
  holdPiece() {
    if (!this._canAct() || !this.canHold) return;
    this.canHold = false;
    const cur = this.cur.type;
    if (this.hold == null) { this.hold = cur; this.spawn(); }
    else { const s = this.hold; this.hold = cur; this.spawn(s); }
  }

  _canAct() { return !this.gameOver && !this.paused; }

  _lock() {
    for (const [r, c] of this._cells(this.cur)) {
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.board[r][c] = this.cur.type;
    }
    this._clearLines();
    this.spawn();
    this.canHold = true;
    this.onScore(this.score, this.level, this.lines);
    if (this.gameOver) this.onGameOver(this.score);
  }

  _clearLines() {
    let cleared = 0;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.board[r].every((v) => v)) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(this.cols).fill(null));
        cleared++; r++;
      }
    }
    if (cleared) {
      this.lines += cleared;
      this.score += [0,100,300,500,800][cleared] * (this.level + 1);
      this.level = Math.floor(this.lines / 10);
    }
  }

  ghostRow() {
    let g = { ...this.cur };
    while (!this._collides(g, 1, 0, 0)) g.row++;
    return g.row;
  }

  _loop() {
    if (this.gameOver) return;
    const tick = () => {
      if (!this.paused && !this.gameOver) {
        if (!this._collides(this.cur, 1, 0, 0)) this.cur.row++;
        else this._lock();
        this.onScore(this.score, this.level, this.lines);
      }
      if (!this.gameOver) this.timer = setTimeout(tick, Math.max(120, 800 - this.level * 65));
    };
    this.timer = setTimeout(tick, Math.max(120, 800 - this.level * 65));
  }

  _draw() {
    const ctx = this.ctx, cell = this.cell;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    // board bg
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);

    // grid dots
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        ctx.fillRect(c * cell + cell/2 - 1, r * cell + cell/2 - 1, 2, 2);
      }

    // settled
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c]) this._block(r, c, COLORS[this.board[r][c]]);
      }

    if (this.cur && !this.gameOver) {
      // ghost
      const gr = this.ghostRow();
      if (gr !== this.cur.row) {
        for (const [r, c] of this._cells({ ...this.cur, row: gr })) {
          if (r >= 0) this._ghost(r, c);
        }
      }
      // current
      for (const [r, c] of this._cells(this.cur)) {
        if (r >= 0) this._block(r, c, COLORS[this.cur.type]);
      }
    }
  }

  _block(r, c, color) {
    const ctx = this.ctx, cell = this.cell, x = c * cell, y = r * cell;
    ctx.fillStyle = color;
    this._round(x + 1.5, y + 1.5, cell - 3, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    this._round(x + 3, y + 3, cell - 10, 3); ctx.fill();
  }
  _ghost(r, c) {
    const ctx = this.ctx, cell = this.cell, x = c * cell, y = r * cell;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    this._round(x + 2, y + 2, cell - 4, 4); ctx.stroke();
  }
  _round(x, y, w, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + w, r);
    ctx.arcTo(x + w, y + w, x, y + w, r);
    ctx.arcTo(x, y + w, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/* ---------------- Wire up ---------------- */
window.addEventListener("DOMContentLoaded", () => {

  // Shared keyboard for the active demo game
  let active = null;
  const setActive = (g) => { active = g; };

  // Hero (ambient, small)
  const heroCv = document.getElementById("hero-canvas");
  if (heroCv) {
    const hero = new DemoGame(heroCv, { cell: 20, cols: 10, rows: 20, ambient: true });
    hero._loop();
    setActive(hero);
    const heroTick = () => { hero._draw(); requestAnimationFrame(heroTick); };
    heroTick();
  }

  // Demo (full)
  const demoCv = document.getElementById("demo-canvas");
  if (demoCv) {
    const scoreEl = document.getElementById("demo-score");
    const levelEl = document.getElementById("demo-level");
    const linesEl = document.getElementById("demo-lines");
    const overlay = document.getElementById("demo-overlay");
    const finalEl = document.getElementById("demo-final");
    const restartBtn = document.getElementById("demo-restart");

    const demo = new DemoGame(demoCv, {
      cell: 26, cols: 10, rows: 20,
      onScore: (s, l, n) => { scoreEl.textContent = s; levelEl.textContent = l; linesEl.textContent = n; },
      onGameOver: (s) => { finalEl.textContent = "Score " + s; overlay.classList.add("is-on"); },
    });
    setActive(demo);
    const demoTick = () => { demo._draw(); requestAnimationFrame(demoTick); };
    demoTick();

    restartBtn.addEventListener("click", () => {
      overlay.classList.remove("is-on");
      demo.reset();
      // restart loop
      clearTimeout(demo.timer);
      demo._loop();
    });
  }

  // Keyboard (only when not typing in an input)
  document.addEventListener("keydown", (e) => {
    if (!active || active.ambient) {} // hero ignores keys; demo uses active
    const g = active;
    if (!g || g.ambient) return;
    const k = e.key;
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(k)) e.preventDefault();
    switch (k) {
      case "ArrowLeft": g.move(-1); break;
      case "ArrowRight": g.move(1); break;
      case "ArrowUp": case "x": case "X": g.rotate(1); break;
      case "z": case "Z": g.rotate(-1); break;
      case "ArrowDown": g.softDrop(); break;
      case " ": g.hardDrop(); break;
      case "c": case "C": g.holdPiece(); break;
      case "p": case "P": g.paused = !g.paused; break;
    }
  });
});

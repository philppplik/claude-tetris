// game/core.mjs — Headless Tetris-Engine (keine Terminal-I/O).
//
// Vollständige Spiellogik: Board, 7 Tetrominoes, SRS-Rotation mit Wall-Kicks,
// 7-Bag-Randomizer, Line-Clears, Scoring, Hold, Game-Over.
//
// Diese Datei hat KEINEN Output und keine Eingabe — sie wird von der TUI (Phase 2)
// gekapselt und hier in Tests verifiziert.

export const WIDTH = 10;
export const HEIGHT = 20;
export const NEXT_QUEUE = 5; // wie viele "Next"-Steine vorgehalten werden

/** Stück-Typen. 0 = leer im Board. */
export const TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * Relative Zellen [row, col] je Rotationszustand (0..3) innerhalb der
 * Stück-Bounding-Box. Daten entsprechen dem offiziellen SRS (Super Rotation
 * System) Guideline — das macht das Spiel sich „richtig" an.
 */
export const SHAPES = {
  O: [
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  ],
  I: [
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  T: [
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ],
  J: [
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  L: [
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
  S: [
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  Z: [
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
};

/** Breite der Bounding-Box je Stück (für Spawn-Position). */
const BOX = { I: 4, O: 2, T: 3, J: 3, L: 3, S: 3, Z: 3 };

/**
 * SRS Wall-Kick-Tabellen (x rechts+, y hoch+). Bei Anwendung wird y negiert,
 * weil unser Board y nach unten zählt.
 */
const KICKS_JLSTZ = {
  "01": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "10": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "12": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "21": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "23": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "32": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "30": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "03": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  "01": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "10": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "12": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "21": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "23": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "32": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "30": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "03": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** Standard-Scoring (Guideline). */
function lineScore(lines, level) {
  const base = { 1: 100, 2: 300, 3: 500, 4: 800 }[lines] ?? 0;
  return base * (level + 1);
}

export class Tetris {
  constructor(opts = {}) {
    /** rng: Funktion -> [0,1). Für deterministische Tests übergebbar. */
    this._rng = opts.rng ?? Math.random;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill(0));
    this.score = 0;
    this.lines = 0;
    this.level = 0;
    this.gameOver = false;
    this._bag = [];
    this.queue = [];
    this.old = null;
    this.canHold = true; // darf im Reset initial true sein
    this.current = null;
    this._refillQueue();
    this.spawn();
  }

  // ---- Randomizer: 7-Bag ----
  _refillQueue() {
    while (this.queue.length < NEXT_QUEUE + 1) {
      if (this._bag.length === 0) {
        this._bag = [...TYPES];
        // Fisher-Yates mit rng mischen
        for (let i = this._bag.length - 1; i > 0; i--) {
          const j = Math.floor(this._rng() * (i + 1));
          [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]];
        }
      }
      this.queue.push(this._bag.pop());
    }
  }

  /** Aktuelle Spawn-Position (oben, zentriert). */
  _spawnPos(type) {
    const box = BOX[type];
    const col = Math.floor((WIDTH - box) / 2);
    return { row: 0, col };
  }

  spawn(type = null) {
    const t = type ?? this.queue.shift();
    this._refillQueue();
    const pos = this._spawnPos(t);
    this.current = { type: t, rot: 0, ...pos };
    // Achtung: canHold wird NICHT hier gesetzt — sonst wird der Hold-Lock
    // (canHold=false) von holdPiece() beim erneuten Spawn überschrieben.
    // canHold wird nur in _lock() (natürlicher Fall) auf true gesetzt.
    // Überlappung bei Spawn = Game Over
    if (this._collides(this.current, 0, 0, 0)) {
      this.gameOver = true;
    }
    return !this.gameOver;
  }

  /** Liefert absolute Zellen [row,col] eines Stücks (oder eines Probe-Offsets). */
  _cells(piece, dRow = 0, dCol = 0, dRot = 0) {
    const shape = SHAPES[piece.type][(piece.rot + dRot + 4) % 4];
    return shape.map(([r, c]) => [
      piece.row + r + dRow,
      piece.col + c + dCol,
    ]);
  }

  _collides(piece, dRow, dCol, dRot) {
    for (const [r, c] of this._cells(piece, dRow, dCol, dRot)) {
      if (c < 0 || c >= WIDTH || r >= HEIGHT) return true; // außerhalb (unten/Seiten)
      if (r >= 0 && this.board[r][c]) return true; // belegt (r<0 = temporär über dem Feld)
    }
    return false;
  }

  // ---- Bewegungen ----
  move(dir) {
    if (this.gameOver) return false;
    if (!this._collides(this.current, 0, dir, 0)) {
      this.current.col += dir;
      return true;
    }
    return false;
  }

  rotate(dir) {
    if (this.gameOver) return false;
    if (this.current.type === "O") return false; // O rotiert nicht
    const from = this.current.rot;
    const to = (from + dir + 4) % 4;
    const table = this.current.type === "I" ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[`${from}${to}`] ?? [[0, 0]];
    for (const [x, y] of kicks) {
      const dy = -y; // y-up -> board-dy
      if (!this._collides(this.current, dy, x, dir)) {
        this.current.row += dy;
        this.current.col += x;
        this.current.rot = to;
        return true;
      }
    }
    return false;
  }

  /** Soft-Drop: 1 nach unten. +1 Punkt. Gibt true zurück wenn bewegt. */
  softDrop() {
    if (this.gameOver) return false;
    if (!this._collides(this.current, 1, 0, 0)) {
      this.current.row += 1;
      this.score += 1;
      return true;
    }
    this._lock();
    return false;
  }

  /** Hard-Drop: fällt ganz runter, +2 Punkte/Zeile, sofort Lock. */
  hardDrop() {
    if (this.gameOver) return 0;
    let dist = 0;
    while (!this._collides(this.current, dist + 1, 0, 0)) dist++;
    this.current.row += dist;
    this.score += dist * 2;
    this._lock();
    return dist;
  }

  /** Ein Gravitations-Schritt (von der TUI-Timer aufgerufen). */
  step() {
    if (this.gameOver) return;
    if (!this._collides(this.current, 1, 0, 0)) {
      this.current.row += 1;
    } else {
      this._lock();
    }
  }

  /** Aktuelles Stück ins Board einbetten + Linien prüfen + nächstes Spawn. */
  _lock() {
    for (const [r, c] of this._cells(this.current)) {
      if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) {
        this.board[r][c] = this.current.type;
      }
    }
    const cleared = this._clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.score += lineScore(cleared, this.level);
      this.level = Math.floor(this.lines / 10);
    }
    this.spawn();
    this.canHold = true; // nach natürlichem Lock wieder halten erlaubt
  }

  _clearLines() {
    let cleared = 0;
    for (let r = HEIGHT - 1; r >= 0; r--) {
      if (this.board[r].every((v) => v !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(new Array(WIDTH).fill(0));
        cleared++;
        r++; // selbe Zeile erneut prüfen (durch Nachrücken)
      }
    }
    return cleared;
  }

  /** Hold: aktuelles Stück tauschen (1× pro Fall). */
  holdPiece() {
    if (this.gameOver || !this.canHold) return false;
    this.canHold = false;
    const cur = this.current.type;
    if (this.old == null) {
      this.old = cur;
      this.spawn();
    } else {
      const swap = this.hold;
      this.hold = cur;
      this.spawn(swap);
    }
    return true;
  }

  /** Board inkl. aktuellem Stück, für Rendering. 0 = leer, sonst Typ-Buchstabe. */
  /**
   * Landeposition („Ghost") des aktuellen Stücks: wie weit es bei Hard-Drop
   * fallen würde. Gibt die Ziel-Row des Stücks (obenstehende Kante) zurück.
   */
  getGhostRow() {
    if (!this.current || this.gameOver) return null;
    let ghost = { ...this.current };
    while (!this._collides(ghost, 1, 0, 0)) {
      ghost.row++;
    }
    return ghost.row;
  }

  getView({ ghost = true } = {}) {
    const view = this.board.map((row) => [...row]);
    if (this.current && !this.gameOver) {
      // Ghost zuerst (damit das echte Stück drüber zeichnet)
      if (ghost) {
        const gr = this.getGhostRow();
        if (gr !== null && gr !== this.current.row) {
          for (const [r, c] of this._cells({ ...this.current, row: gr })) {
            if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) {
              if (view[r][c] === "." || view[r][c] === 0) view[r][c] = "G"; // G = Ghost-Marker
            }
          }
        }
      }
      for (const [r, c] of this._cells(this.current)) {
        if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) {
          view[r][c] = this.current.type;
        }
      }
    }
    return view;
  }

  /** Öffentliche Snapshot-Daten für TUI/Tests. */
  getState() {
    return {
      board: this.getView(),
      current: this.current,
      next: [...this.queue.slice(0, NEXT_QUEUE)],
      hold: this.hold,
      score: this.score,
      lines: this.lines,
      level: this.level,
      gameOver: this.gameOver,
    };
  }
}

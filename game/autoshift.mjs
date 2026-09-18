// game/autoshift.mjs — DAS/ARR (Delayed Auto Shift / Auto Repeat Rate).
//
// Tippen bewegt ein Feld. Gedrückthalten schiebt das Stück durch. Das ist der
// Unterschied zwischen „jedes Feld einzeln klicken" und flüssigem Spiel.
//
// WICHTIGE EINSCHRÄNKUNG IM TERMINAL:
// Ein Terminal im Raw-Mode liefert nur Key-DOWN-Events, kein Key-UP. Wir können
// „Taste wird gehalten" also nicht direkt sehen — wir erkennen es an der
// Auto-Repeat-Kette, die das Betriebssystem selbst schickt. Damit ist unser DAS
// nach unten durch die OS-Repeat-Verzögerung begrenzt (typisch 250–500 ms);
// ein DAS von 100 ms kann nicht früher feuern als das erste Repeat-Event
// eintrifft. Was wir voll kontrollieren, ist das Verhalten DANACH — und das ist
// der größere Teil des Spielgefühls: mit ARR=0 rutscht das Stück ab dem ersten
// Repeat sofort bis an die Wand.
//
// Reine Logik, Uhr injizierbar — damit ohne Terminal testbar.

/** Moderne Competitive-Defaults. */
export const DAS_MS = 100;
export const ARR_MS = 0;

/**
 * Zwei Events derselben Taste, die enger als das beieinander liegen, stammen
 * vom OS-Auto-Repeat und nicht von einem Menschen. Schnelles Antippen von Hand
 * liegt praktisch nie unter ~80 ms, OS-Repeat typischerweise bei ~30 ms.
 */
export const REPEAT_GAP_MS = 60;

/** Rückgabewert von press(): so viele Felder soll sich das Stück bewegen. */
export const TO_WALL = Infinity;

export class AutoShift {
  constructor({ das = DAS_MS, arr = ARR_MS, repeatGap = REPEAT_GAP_MS } = {}) {
    this.das = das;
    this.arr = arr;
    this.repeatGap = repeatGap;
    this.reset();
  }

  reset() {
    this.key = null;
    this.last = -Infinity; // Zeitpunkt des letzten Events
    this.first = -Infinity; // Beginn der aktuellen Repeat-Kette
    this.charged = false; // DAS durchlaufen?
    this.lastShift = -Infinity; // Zeitpunkt der letzten ausgelösten Bewegung
  }

  /**
   * Ein Tastendruck.
   * @param {string} key  Identität der Taste ("left" / "right")
   * @param {number} now  Zeit in ms
   * @returns {number} Felder: 1 = ein Schritt, 0 = unterdrückt (ARR-Sperre),
   *                   TO_WALL = bis zur Wand durchschieben.
   */
  press(key, now) {
    const sameKey = key === this.key;
    const gap = now - this.last;
    this.key = key;
    this.last = now;

    // Neue Taste oder zu großer Abstand -> das war ein echtes Antippen und
    // startet eine frische Kette.
    if (!sameKey || gap > this.repeatGap) {
      this.first = now;
      this.charged = false;
      this.lastShift = now;
      return 1;
    }

    // Wir stecken in einer Auto-Repeat-Kette.
    if (!this.charged) {
      if (now - this.first < this.das) return 0; // DAS lädt noch
      this.charged = true;
    }

    if (this.arr === 0) {
      this.lastShift = now;
      return TO_WALL;
    }
    if (now - this.lastShift < this.arr) return 0; // ARR-Takt noch nicht erreicht
    this.lastShift = now;
    return 1;
  }
}

/** Liest DAS/ARR aus der Umgebung, damit man es ohne Rebuild tunen kann. */
export function autoShiftFromEnv(env = process.env) {
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return new AutoShift({
    das: num(env.CLAUDE_TETRIS_DAS, DAS_MS),
    arr: num(env.CLAUDE_TETRIS_ARR, ARR_MS),
  });
}

// tests/autoshift.test.mjs — DAS/ARR-Logik, reine Zeitrechnung ohne Terminal.

import test from "node:test";
import assert from "node:assert/strict";
import {
  AutoShift,
  autoShiftFromEnv,
  TO_WALL,
  DAS_MS,
  ARR_MS,
  REPEAT_GAP_MS,
} from "../game/autoshift.mjs";

test("Defaults sind die modernen Competitive-Werte", () => {
  assert.equal(DAS_MS, 100);
  assert.equal(ARR_MS, 0, "ARR 0 = sofort bis zur Wand");
});

test("Antippen bewegt genau ein Feld", () => {
  const a = new AutoShift();
  assert.equal(a.press("left", 0), 1);
});

test("mehrfaches Antippen von Hand bleibt einzelne Schritte", () => {
  const a = new AutoShift();
  // Abstände deutlich über der Repeat-Schwelle = menschliches Tippen.
  assert.equal(a.press("left", 0), 1);
  assert.equal(a.press("left", 200), 1);
  assert.equal(a.press("left", 400), 1);
});

test("gehaltene Taste rutscht bis zur Wand (realistischer OS-Repeat-Strom)", () => {
  const a = new AutoShift();
  // So sieht Gedrückthalten im Terminal wirklich aus: ein Druck, dann die
  // OS-Repeat-Verzögerung (~500 ms), dann ein enger Takt (~30 ms).
  assert.equal(a.press("left", 0), 1, "erster Druck");
  assert.equal(a.press("left", 500), 1, "erstes Repeat ist von einem Tap nicht zu unterscheiden");
  assert.equal(a.press("left", 530), 0, "enger Takt erkannt, DAS lädt");
  assert.equal(a.press("left", 560), 0);
  assert.equal(a.press("left", 590), 0);
  assert.equal(a.press("left", 620), TO_WALL, "DAS voll -> durchrutschen");
  assert.equal(a.press("left", 650), TO_WALL, "und bleibt gerutscht");
});

test("ein Doppeltipp rutscht NIE bis zur Wand", () => {
  // Das ist die Eigenschaft, die die Repeat-Erkennung überhaupt rechtfertigt:
  // zwei bewusste Tastendrücke dürfen nicht als Halten durchgehen.
  for (const gap of [80, 120, 200, 400, 500]) {
    const a = new AutoShift();
    assert.equal(a.press("left", 0), 1);
    assert.equal(a.press("left", gap), 1, `Abstand ${gap}ms bleibt ein Einzelschritt`);
  }
});

test("während DAS noch lädt, wird unterdrückt statt zu rutschen", () => {
  const a = new AutoShift({ das: 100 });
  assert.equal(a.press("left", 0), 1);
  // Repeat kommt schon nach 30 ms -> DAS (100 ms) ist noch nicht voll.
  assert.equal(a.press("left", 30), 0);
  assert.equal(a.press("left", 60), 0);
  // Ab 100 ms nach Kettenbeginn ist geladen.
  assert.equal(a.press("left", 110), TO_WALL);
});

test("Richtungswechsel startet eine frische Kette", () => {
  const a = new AutoShift();
  a.press("left", 0);
  a.press("left", 500); // aufgeladen
  assert.equal(a.press("right", 510), 1, "andere Taste = neuer Tap");
  assert.equal(a.press("right", 520), 0, "und lädt neu, statt sofort zu rutschen");
});

test("eine Pause länger als die Repeat-Schwelle beendet die Kette", () => {
  const a = new AutoShift();
  a.press("left", 0);
  a.press("left", 500);
  // Taste losgelassen, später neu getippt.
  assert.equal(a.press("left", 500 + REPEAT_GAP_MS + 1), 1, "wieder ein Tap");
});

test("ARR > 0 taktet einzelne Schritte statt zu rutschen", () => {
  const a = new AutoShift({ das: 100, arr: 50 });
  assert.equal(a.press("left", 0), 1);
  assert.equal(a.press("left", 500), 1, "erstes Repeat = Tap");
  for (const t of [530, 560, 590]) assert.equal(a.press("left", t), 0, "DAS lädt");
  assert.equal(a.press("left", 620), 1, "geladen: ein Schritt, kein Rutsch");
  assert.equal(a.press("left", 650), 0, "ARR-Takt noch nicht erreicht");
  assert.equal(a.press("left", 680), 1, "nächster Schritt");
});

test("reset() bricht eine laufende Kette ab", () => {
  const a = new AutoShift();
  a.press("left", 0);
  a.press("left", 500);
  a.reset();
  assert.equal(a.press("left", 510), 1, "nach reset wieder ein Tap");
});

test("DAS/ARR sind per Umgebungsvariable einstellbar", () => {
  const a = autoShiftFromEnv({ CLAUDE_TETRIS_DAS: "250", CLAUDE_TETRIS_ARR: "33" });
  assert.equal(a.das, 250);
  assert.equal(a.arr, 33);
});

test("unsinnige Umgebungswerte fallen auf die Defaults zurück", () => {
  const a = autoShiftFromEnv({ CLAUDE_TETRIS_DAS: "schnell", CLAUDE_TETRIS_ARR: "-5" });
  assert.equal(a.das, DAS_MS);
  assert.equal(a.arr, ARR_MS);
});

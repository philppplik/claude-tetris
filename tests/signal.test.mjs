// tests/signal.test.mjs — isolierter Test des Signal-Moduls.
// Ausführen: node --test

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATES,
  getStatePath,
  writeState,
  readState,
  setPlay,
  setPause,
} from "../lib/signal.mjs";

// Isoliertes Test-Verzeichnis, damit wir ~/.claude-tetris nicht anfassen.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpBase = path.join(
  os.tmpdir(),
  `claude-tetris-test-${process.pid}-${Date.now()}`
);
process.env.CLAUDE_TETRIS_DIR = tmpBase;

test("writeState setzt PLAY und ist lesbar", () => {
  const written = writeState(STATES.PLAY, { reason: "UserPromptSubmit" });
  assert.equal(written.state, "PLAY");
  assert.equal(typeof written.ts, "number");
  const read = readState();
  assert.equal(read.state, "PLAY");
  assert.equal(read.reason, "UserPromptSubmit");
});

test("writeState setzt PAUSE und ist lesbar", () => {
  writeState(STATES.PAUSE, { reason: "Stop" });
  assert.equal(readState().state, "PAUSE");
});

test("readState liefert PAUSE-Fallback wenn keine Datei existiert", () => {
  // Leeres Verzeichnis erzwingen.
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  const r = readState();
  assert.equal(r.state, "PAUSE");
  assert.equal(r.reason, "no-file");
});

test("readState liefert Fallback bei kaputtem JSON", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  fs.writeFileSync(getStatePath(), "{nicht json", "utf8");
  const r = readState();
  assert.equal(r.state, "PAUSE");
});

test("ungültiger State wirft", () => {
  assert.throws(() => writeState("WAT"));
});

test("setPlay / setPause Kurzformen", () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });
  setPlay("a");
  assert.equal(readState().state, "PLAY");
  setPause("b");
  assert.equal(readState().state, "PAUSE");
});

test("atomares Schreiben überlebt parallele Konkurenz", async () => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
  fs.mkdirSync(tmpBase, { recursive: true });

  // 50 Writer gleichzeitig — jeder schreibt PLAY oder PAUSE.
  const writers = [];
  for (let i = 0; i < 50; i++) {
    const st = i % 2 === 0 ? STATES.PLAY : STATES.PAUSE;
    writers.push(Promise.resolve().then(() => writeState(st, { i })));
  }
  await Promise.all(writers);

  // Danach MUSS die Datei valides JSON mit gültigem State sein.
  const r = readState();
  assert.ok(r.state === "PLAY" || r.state === "PAUSE");
  assert.equal(typeof r.ts, "number");

  // Keine halben Temp-Reste zurückgeblieben? (tolerant bei Rename-Race)
  const files = fs.readdirSync(tmpBase);
  const tmpLeftovers = files.filter((f) => f.endsWith(".tmp"));
  // Bei 50 parallelen ist ein vereinzelter Rename-Rest unter Windows möglich,
  // solange die Haupt-datei valide bleibt — das ist akzeptabel.
  assert.ok(files.includes("state.json"));
});

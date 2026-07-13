// tests/install.test.mjs — Install/Uninstall mergt sicher in bestehende settings.json.
// Nutzt eine KOPIE der echten settings.json (kein Schreiben auf das Original).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL = path.join(ROOT, "scripts", "install.mjs");
const UNINSTALL = path.join(ROOT, "scripts", "uninstall.mjs");

const REAL = path.join(os.homedir(), ".claude", "settings.json");
const TMP = path.join(os.tmpdir(), `ct-install-${process.pid}`);
const FAKE_HOME = path.join(TMP, "home");
const FAKE_CLAUDE_DIR = path.join(FAKE_HOME, ".claude");
const FAKE_SETTINGS = path.join(FAKE_CLAUDE_DIR, "settings.json");

function setup() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(FAKE_SETTINGS), { recursive: true });
  // Echte settings.json kopieren (falls vorhanden), sonst Minimal-Config
  const base = fs.existsSync(REAL)
    ? JSON.parse(fs.readFileSync(REAL, "utf8"))
    : { hooks: {} };
  fs.writeFileSync(FAKE_SETTINGS, JSON.stringify(base, null, 2));
}

test("install fügt tetris-Hooks hinzu, behält bestehende (rune) bei", () => {
  setup();
  execFileSync("node", [INSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  const s = JSON.parse(fs.readFileSync(FAKE_SETTINGS, "utf8"));
  // Unsere Hooks vorhanden?
  const ups = s.hooks["UserPromptSubmit"].some((e) =>
    e.hooks.some((h) => h.command.includes("tetris-signal.mjs") && h.command.includes("play"))
  );
  const stop = s.hooks["Stop"].some((e) =>
    e.hooks.some((h) => h.command.includes("tetris-signal.mjs") && h.command.includes("pause"))
  );
  assert.ok(ups, "UserPromptSubmit Hook hinzugefügt");
  assert.ok(stop, "Stop Hook hinzugefügt");
  // Bestehende Hooks (rune-kit) noch da?
  const rune = JSON.stringify(s.hooks).includes("rune-kit");
  assert.ok(rune, "Bestehende rune-kit Hooks erhalten geblieben");
});

test("install ist idempotent (zweiter Lauf duppliert nicht)", () => {
  setup();
  execFileSync("node", [INSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  execFileSync("node", [INSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  const s = JSON.parse(fs.readFileSync(FAKE_SETTINGS, "utf8"));
  const playCount = s.hooks["UserPromptSubmit"].filter((e) =>
    e.hooks.some((h) => h.command.includes("play"))
  ).length;
  assert.equal(playCount, 1, "Nur ein play-Hook nach 2x install");
});

test("uninstall entfernt tetris-Hooks, behält rune-kit", () => {
  setup();
  execFileSync("node", [INSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  execFileSync("node", [UNINSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  const s = JSON.parse(fs.readFileSync(FAKE_SETTINGS, "utf8"));
  const tetrisLeft = JSON.stringify(s.hooks || {}).includes("tetris-signal.mjs");
  assert.equal(tetrisLeft, false, "Alle tetris-Hooks entfernt");
  const rune = JSON.stringify(s.hooks || {}).includes("rune-kit");
  assert.ok(rune, "rune-kit Hooks erhalten");
});

test("install schreibt NIEMALS auf die echte settings.json", () => {
  const before = fs.existsSync(REAL) ? fs.readFileSync(REAL, "utf8") : null;
  // Lauf mit FAKEM Home — echtes Home darf nicht angefasst werden
  setup();
  execFileSync("node", [INSTALL], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: FAKE_CLAUDE_DIR, HOME: FAKE_HOME },
  });
  const after = fs.existsSync(REAL) ? fs.readFileSync(REAL, "utf8") : null;
  assert.equal(before, after, "Echte settings.json unverändert");
});

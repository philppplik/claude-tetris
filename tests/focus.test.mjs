// tests/focus.test.mjs — Autofokus: welches Kommando holt den Fokus wohin?
// Reine Logik, deshalb auf jeder Plattform prüfbar.

import test from "node:test";
import assert from "node:assert/strict";
import { focusCommand, focusEnabled } from "../lib/focus.mjs";

const panes = (over = {}) => ({
  backend: "tmux", window: null, claude: "%1", game: "%2", ...over,
});

test("tmux spricht die Panes über ihre IDs an", () => {
  const g = focusCommand(panes(), "game");
  assert.deepEqual(g, { command: "tmux", args: ["select-pane", "-t", "%2"] });
  const c = focusCommand(panes(), "claude");
  assert.deepEqual(c.args, ["select-pane", "-t", "%1"]);
});

test("Windows Terminal nutzt move-focus, weil es kein focus-pane gibt", () => {
  // focus-tab adressiert Tabs, nicht Panes. move-focus ist richtungsbasiert
  // und passt zum Layout Claude links / Spiel rechts.
  const p = panes({ backend: "wt", window: "claude-tetris" });
  assert.deepEqual(focusCommand(p, "game"), {
    command: "wt.exe",
    args: ["-w", "claude-tetris", "move-focus", "right"],
  });
  assert.deepEqual(focusCommand(p, "claude").args.at(-1), "left");
});

test("Windows Terminal adressiert ein BENANNTES Fenster", () => {
  // Mit "-w 0" (zuletzt benutztes Fenster) würde bei mehreren offenen
  // Terminals das falsche den Fokus bekommen.
  const p = panes({ backend: "wt", window: "claude-tetris" });
  const args = focusCommand(p, "game").args;
  assert.equal(args[0], "-w");
  assert.equal(args[1], "claude-tetris");
  assert.notEqual(args[1], "0");
});

test("ohne Fensternamen macht wt nichts, statt zu raten", () => {
  assert.equal(focusCommand(panes({ backend: "wt", window: null }), "game"), null);
});

test("wezterm und kitty nutzen ihre eigenen CLIs", () => {
  const w = focusCommand(panes({ backend: "wezterm", game: "7" }), "game");
  assert.deepEqual(w, { command: "wezterm", args: ["cli", "activate-pane", "--pane-id", "7"] });
  const k = focusCommand(panes({ backend: "kitty", game: "12" }), "game");
  assert.deepEqual(k, { command: "kitty", args: ["@", "focus-window", "--match", "id:12"] });
});

test("iTerm2 wählt die Session per AppleScript", () => {
  const i = focusCommand(panes({ backend: "iterm", game: "ABC-123" }), "game");
  assert.equal(i.command, "osascript");
  assert.match(i.args[1], /session id "ABC-123" to select/);
});

test("fehlende Pane-Info führt zu null, nicht zu einem kaputten Kommando", () => {
  assert.equal(focusCommand(null, "game"), null);
  assert.equal(focusCommand(panes({ game: null }), "game"), null);
  assert.equal(focusCommand(panes({ claude: null }), "claude"), null);
  assert.equal(focusCommand(panes({ backend: "screen" }), "game"), null);
});

test("unbekanntes Ziel wird abgelehnt", () => {
  assert.equal(focusCommand(panes(), "somewhere"), null);
});

test("Autofokus ist standardmäßig an und abschaltbar", () => {
  assert.equal(focusEnabled({}), true);
  for (const v of ["0", "false", "NO", "Off"]) {
    assert.equal(focusEnabled({ CLAUDE_TETRIS_FOCUS: v }), false, `aus mit "${v}"`);
  }
  assert.equal(focusEnabled({ CLAUDE_TETRIS_FOCUS: "1" }), true);
});

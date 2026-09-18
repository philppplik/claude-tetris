// tests/launch.test.mjs — Backend-Auswahl des Launchers (rein, plattformunabhängig)
// plus Smoke-Test des echten Dry-Runs.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { planLaunch, fallbackHelp, BACKENDS } from "../scripts/launch-plan.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCH = path.join(ROOT, "scripts", "launch.mjs");

const base = { projectDir: "/proj dir", pluginDir: "/plug dir" };
const all = () => true;
const none = () => false;

function plan(over = {}) {
  return planLaunch({ ...base, has: all, env: {}, platform: "linux", ...over });
}

test("Windows: wählt Windows Terminal und baut new-tab + split-pane", () => {
  const p = plan({ platform: "win32" });
  assert.equal(p.backend, "wt");
  assert.equal(p.command, "wt.exe");
  assert.ok(p.args.includes("split-pane"));
  assert.ok(p.args.includes("new-tab"));
  assert.ok(p.args.some((a) => a.includes("tetris.mjs")), "Tetris im Kommando");
  assert.ok(p.args.some((a) => a.includes("claude")), "Claude im Kommando");
});

test("Linux in tmux-Session: split-window mit Fokus-Rückgabe", () => {
  const p = plan({ platform: "linux", env: { TMUX: "/tmp/tmux-1/default,123,0" } });
  assert.equal(p.backend, "tmux");
  assert.equal(p.command, "tmux");
  assert.ok(p.args.includes("split-window"));
  assert.ok(p.args.includes("-h"), "horizontal geteilt = Tetris rechts");
  assert.equal(p.args.at(-1), "last-pane", "Fokus zurück zu Claude");
});

test("tmux ohne laufende Session wird NICHT gewählt (nichts zum Splitten)", () => {
  const p = plan({ platform: "linux", env: {} });
  assert.notEqual(p.backend, "tmux");
});

test("macOS in iTerm2: osascript mit split vertically", () => {
  const p = plan({ platform: "darwin", env: { TERM_PROGRAM: "iTerm.app" } });
  assert.equal(p.backend, "iterm");
  assert.equal(p.command, "osascript");
  assert.ok(p.args.join(" ").includes("split vertically"));
});

test("macOS ohne iTerm2 fällt nicht versehentlich auf iTerm zurück", () => {
  const p = plan({ platform: "darwin", env: { TERM_PROGRAM: "Apple_Terminal" } });
  assert.notEqual(p.backend, "iterm");
});

test("kitty und wezterm nur innerhalb ihrer eigenen Session", () => {
  const k = plan({ platform: "linux", env: { KITTY_WINDOW_ID: "1" } });
  assert.equal(k.backend, "kitty");
  assert.ok(k.args.includes("vsplit"));

  const w = plan({ platform: "linux", env: { WEZTERM_PANE: "0" } });
  assert.equal(w.backend, "wezterm");
  assert.ok(w.args.includes("--right"));
});

test("kein passendes Terminal: Plan meldet Fehlschlag statt zu raten", () => {
  const p = plan({ platform: "linux", has: none, env: {} });
  assert.equal(p.backend, null);
  assert.ok(p.reason.length > 0);
  assert.deepEqual(p.tried, BACKENDS);
});

test("--backend erzwingt genau ein Backend", () => {
  const ok = plan({ platform: "linux", env: { TMUX: "x" }, prefer: "tmux" });
  assert.equal(ok.backend, "tmux");
  // Erzwungenes Backend, das hier nicht laufen kann -> sauberer Fehlschlag,
  // kein stiller Rückfall auf ein anderes.
  const bad = plan({ platform: "linux", env: {}, prefer: "wt" });
  assert.equal(bad.backend, null);
  assert.deepEqual(bad.tried, ["wt"]);
});

test("Pfade mit Leerzeichen werden gequotet", () => {
  const p = plan({ platform: "win32", pluginDir: "C:/Program Files/ct" });
  const joined = p.args.join(" ");
  assert.ok(joined.includes('"C:/Program Files/ct'), "Plugin-Pfad in Quotes");
});

test("fallbackHelp nennt plattformgerechte Optionen", () => {
  assert.ok(fallbackHelp("win32").includes("Windows Terminal"));
  assert.ok(fallbackHelp("linux").includes("tmux"));
  assert.ok(fallbackHelp("darwin").includes("iTerm2"));
  // Der fensterübergreifende Ausweg muss immer dabeistehen.
  for (const pf of ["win32", "linux", "darwin"]) {
    assert.ok(fallbackHelp(pf).includes("zweites Terminal"));
  }
});

test("dry-run gibt Backend und Kommando aus, ohne ein Fenster zu öffnen", () => {
  const out = execFileSync("node", [LAUNCH, "--dry-run"], { encoding: "utf8" });
  assert.ok(out.includes("DRY-RUN backend="), "nennt das Backend");
  assert.ok(out.includes("tetris.mjs"), "Tetris-Binary im Kommando");
  assert.ok(!out.includes("--dry-run &&"), "Flag nicht als Projektpfad missdeutet");
});

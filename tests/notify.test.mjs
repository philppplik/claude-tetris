// tests/notify.test.mjs — Pause bei Permission-Rückfragen (Notification-Hook).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIGNAL = path.join(ROOT, "scripts", "tetris-signal.mjs");
const DIR = path.join(os.tmpdir(), `ct-notify-${process.pid}-${Date.now()}`);

function run(args, env = {}) {
  return execFileSync("node", [SIGNAL, ...args], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_TETRIS_DIR: DIR, ...env },
  });
}

function state() {
  return JSON.parse(run(["status"])).state;
}

test("notify pausiert das Spiel", () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  run(["play"]);
  assert.equal(state(), "PLAY");
  run(["notify"]);
  assert.equal(state(), "PAUSE", "Permission-Rückfrage pausiert");
});

test("notify vermerkt den Grund getrennt von einem normalen Stop", () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  run(["notify"]);
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, "state.json"), "utf8"));
  assert.match(String(raw.reason ?? ""), /permission/i);
});

test("CLAUDE_TETRIS_PAUSE_ON_PERMISSION=0 lässt weiterspielen", () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  run(["play"]);
  const out = run(["notify"], { CLAUDE_TETRIS_PAUSE_ON_PERMISSION: "0" });
  assert.equal(state(), "PLAY", "bleibt im Spiel");
  assert.match(out, /deaktiviert/);
});

test("auch false/no/off schalten ab, in beliebiger Schreibweise", () => {
  for (const v of ["false", "NO", "Off"]) {
    fs.rmSync(DIR, { recursive: true, force: true });
    run(["play"]);
    run(["notify"], { CLAUDE_TETRIS_PAUSE_ON_PERMISSION: v });
    assert.equal(state(), "PLAY", `abgeschaltet mit "${v}"`);
  }
});

test("ein beliebiger anderer Wert lässt die Pause aktiv", () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  run(["play"]);
  run(["notify"], { CLAUDE_TETRIS_PAUSE_ON_PERMISSION: "1" });
  assert.equal(state(), "PAUSE");
});

test("unbekanntes Kommando endet mit Code 1", () => {
  assert.throws(
    () => run(["frobnicate"]),
    (e) => e.status === 1 && String(e.stderr).includes("notify"),
  );
});

test("Notification-Hook ist im Plugin-Manifest registriert", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8"));
  const cmd = hooks.hooks.Notification?.[0]?.hooks?.[0]?.command;
  assert.ok(cmd, "Notification-Event vorhanden");
  assert.match(cmd, /notify$/);
});

test("install und uninstall kennen dieselben Events", async () => {
  // Sicher, weil install.mjs beim Import nichts ausführt (lib/direct-run.mjs).
  const { HOOKS } = await import("../scripts/install.mjs");
  const events = HOOKS.map(([e]) => e);
  assert.deepEqual(events, ["UserPromptSubmit", "Stop", "Notification"]);
  const uninstallSrc = fs.readFileSync(path.join(ROOT, "scripts", "uninstall.mjs"), "utf8");
  for (const e of events) {
    assert.ok(uninstallSrc.includes(`"${e}"`), `uninstall räumt ${e} auf`);
  }
});

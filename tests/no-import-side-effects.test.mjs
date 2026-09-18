// tests/no-import-side-effects.test.mjs
//
// Regression: install.mjs und uninstall.mjs riefen main() auf Modulebene auf.
// Ein blosser `import` — etwa aus einem Test, der nur eine Konstante lesen
// wollte — hat damit echte Hooks in die settings.json des Users geschrieben.
// Diese Skripte dürfen beim Import NICHTS anfassen.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Importiert ein Skript in einem eigenen Prozess mit einem Wegwerf-Home. */
function importWithFakeHome(script) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ct-side-"));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  const settings = path.join(claudeDir, "settings.json");
  fs.writeFileSync(settings, JSON.stringify({ hooks: {} }, null, 2));
  const before = fs.readFileSync(settings, "utf8");

  const url = "file:///" + path.join(ROOT, "scripts", script).replace(/\\/g, "/");
  execFileSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)})`], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir, HOME: home },
    encoding: "utf8",
  });

  const after = fs.readFileSync(settings, "utf8");
  fs.rmSync(home, { recursive: true, force: true });
  return { before, after };
}

for (const script of ["install.mjs", "uninstall.mjs"]) {
  test(`import von ${script} verändert die settings.json nicht`, () => {
    const { before, after } = importWithFakeHome(script);
    assert.equal(after, before, `${script} hat beim Import geschrieben`);
  });
}

test("direkt ausgeführt tut install.mjs weiterhin seine Arbeit", () => {
  // Die Gegenprobe: der Guard darf das Skript nicht komplett lahmlegen.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ct-side-run-"));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "install.mjs")], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir, HOME: home },
    encoding: "utf8",
  });
  const s = fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8");
  assert.ok(s.includes("tetris-signal.mjs"), "Hooks geschrieben");
  fs.rmSync(home, { recursive: true, force: true });
});

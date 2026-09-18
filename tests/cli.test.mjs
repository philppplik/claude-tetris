// tests/cli.test.mjs — `claude-tetris <subcommand>` dispatcht korrekt.
// Deckt die im README dokumentierte CLI-Oberfläche ab.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "tetris.mjs");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function run(args, opts = {}) {
  return execFileSync("node", [BIN, ...args], { encoding: "utf8", ...opts });
}

test("--version gibt die Version aus package.json aus", () => {
  assert.equal(run(["--version"]).trim(), pkg.version);
});

test("--help listet alle Subkommandos", () => {
  const out = run(["--help"]);
  for (const cmd of ["launch", "install", "uninstall"]) {
    assert.ok(out.includes(cmd), `${cmd} dokumentiert`);
  }
});

test("launch delegiert an scripts/launch.mjs (Flags werden durchgereicht)", () => {
  const out = run(["launch", "--dry-run"]);
  assert.ok(out.includes("DRY-RUN"), "launch.mjs wurde ausgeführt");
});

test("install delegiert an scripts/install.mjs", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ct-cli-"));
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  run(["install"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir, HOME: home },
  });
  const s = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"));
  assert.ok(JSON.stringify(s.hooks).includes("tetris-signal.mjs"), "Hooks geschrieben");
  fs.rmSync(home, { recursive: true, force: true });
});

test("unbekanntes Kommando: Exit-Code 1 statt stillem Spielstart", () => {
  assert.throws(
    () => run(["frobnicate"], { stdio: "pipe" }),
    (e) => e.status === 1 && String(e.stderr).includes("Unbekanntes Kommando"),
  );
});

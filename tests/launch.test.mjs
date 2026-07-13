// tests/launch.test.mjs — Launcher baut korrekte wt.exe-Argumente (dry-run).

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCH = path.join(ROOT, "scripts", "launch.mjs");

test("dry-run baut wt.exe Split-Pane Kommando (ohne Fenster zu öffnen)", () => {
  const out = execFileSync("node", [LAUNCH, "--dry-run"], {
    env: process.env,
    encoding: "utf8",
  });
  assert.ok(out.includes("DRY-RUN wt.exe"), "gibt Kommando aus");
  assert.ok(out.includes("split-pane"), "Split-Pane enthalten");
  assert.ok(out.includes("Claude Code"), "Claude-Pane Titel");
  assert.ok(out.includes("claude-tetris"), "Tetris-Pane Titel");
  assert.ok(out.includes("tetris.mjs"), "Tetris-Binary im Kommando");
  assert.ok(!out.includes("--dry-run &&"), "Projekt-Pfad nicht mit Flag verwechselt");
});


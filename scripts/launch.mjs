#!/usr/bin/env node
// scripts/launch.mjs — Startet die Split-Pane: Claude Code links, Tetris rechts.
//
// Nutzt Windows Terminal (`wt.exe`), das auf diesem Windows-Setup vorhanden ist.
// Claude läuft nativ (npm global), kein WSL nötig.
//
// Aufruf:  node scripts/launch.mjs [projekt-pfad]
//   ohne Pfad: aktuelles Verzeichnis

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(__dirname, "..");

const projectDir = process.argv.slice(2).find((a) => !a.startsWith("--")) || process.cwd();

// Windows Terminal existiert?
function findWT() {
  // wt.exe ist meist im PATH
  const r = spawnSync("wt.exe", ["--version"], { stdio: "ignore" });
  return r.status === 0;
}

function main() {
  if (process.argv.includes("--dry-run")) {
    const tetrisCmd = `node "${path.join(PLUGIN_DIR, "bin", "tetris.mjs")}"`;
    const wtArgs = [
      "new-tab",
      "--title", "Claude Code",
      "cmd", "/k", `cd /d "${projectDir}" && claude`,
      ";",
      "split-pane", "--size", "0.38",
      "--title", "claude-tetris",
      "cmd", "/k", `cd /d "${PLUGIN_DIR}" && ${tetrisCmd}`,
    ];
    console.log("DRY-RUN wt.exe " + wtArgs.map((a) => JSON.stringify(a)).join(" "));
    return;
  }

  if (!findWT()) {
    console.error("❌ Windows Terminal (wt.exe) nicht gefunden.");
    console.error("   Installiere es aus dem Microsoft Store oder nutze launch-split.bat.");
    process.exit(1);
  }

  const tetrisCmd = `node "${path.join(PLUGIN_DIR, "bin", "tetris.mjs")}"`;

  const wtArgs = [
    "new-tab",
    "--title", "Claude Code",
    "cmd", "/k", `cd /d "${projectDir}" && claude`,
    ";",
    "split-pane", "--size", "0.38",
    "--title", "claude-tetris",
    "cmd", "/k", `cd /d "${PLUGIN_DIR}" && ${tetrisCmd}`,
  ];

  console.log("🚀 Starte Split-Pane…");
  console.log(`   Links:  Claude Code  (${projectDir})`);
  console.log(`   Rechts: claude-tetris (${PLUGIN_DIR})`);
  console.log("");

  // WICHTIG: shell:false — sonst jagt Node die Args durch eine weitere
  // cmd.exe-Ebene, die das ';' zum Separator macht und die Quotes zerschießt.
  // So erhält wt.exe exakt das argv, das wir hier bauen.
  const r = spawnSync("wt.exe", wtArgs, { stdio: "inherit", shell: false });
  if (r.error) {
    console.error(`❌ Konnte Windows Terminal nicht starten: ${r.error.message}`);
    process.exit(1);
  }
  console.log("✅ Fenster geöffnet. Tetris pausiert automatisch, wenn Claude fertig ist.");
  console.log("   (Strg+C in der Tetris-Pane beendet das Spiel.)");
}

main();

#!/usr/bin/env node
// scripts/launch.mjs — Öffnet die Split-Pane: Claude Code links, Tetris rechts.
//
// Wählt automatisch das passende Terminal-Backend (Windows Terminal, tmux,
// iTerm2, kitty, WezTerm). Die Auswahl-Logik liegt in launch-plan.mjs und ist
// dort getestet — diese Datei führt nur aus.
//
// Aufruf:  node scripts/launch.mjs [projekt-pfad] [--backend=tmux] [--dry-run]

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planLaunch, fallbackHelp } from "./launch-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const projectDir = argv.find((a) => !a.startsWith("--")) || process.cwd();
const dryRun = argv.includes("--dry-run");
const prefer = argv.find((a) => a.startsWith("--backend="))?.split("=")[1] ?? null;

/** Ist das Kommando aufrufbar? */
function has(cmd) {
  const probe = cmd === "osascript" ? ["-e", "return 1"] : ["--version"];
  try {
    return spawnSync(cmd, probe, { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

const plan = planLaunch({
  projectDir,
  pluginDir: PLUGIN_DIR,
  platform: process.platform,
  env: process.env,
  has: dryRun ? () => true : has,
  prefer,
});

if (!plan.backend) {
  console.error(`❌ ${plan.reason}\n`);
  console.error(fallbackHelp(process.platform));
  process.exit(1);
}

if (dryRun) {
  console.log(`DRY-RUN backend=${plan.backend}`);
  console.log(`DRY-RUN ${plan.command} ${plan.args.map((a) => JSON.stringify(a)).join(" ")}`);
  process.exit(0);
}

console.log(`🚀 Starte Split-Pane via ${plan.backend}…`);
console.log(`   Claude Code:   ${projectDir}`);
console.log(`   claude-tetris: ${PLUGIN_DIR}`);
console.log("");

// shell:false ist wichtig: sonst interpretiert eine weitere Shell-Ebene das
// ';' als Separator und zerlegt die Quotes.
const r = spawnSync(plan.command, plan.args, { stdio: "inherit", shell: false });
if (r.error) {
  console.error(`❌ Konnte ${plan.command} nicht starten: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`❌ ${plan.command} endete mit Code ${r.status}.`);
  process.exit(r.status ?? 1);
}

console.log("✅ Pane offen. Tetris pausiert automatisch, sobald Claude fertig ist.");
console.log("   (Q oder Strg+C in der Tetris-Pane beendet das Spiel.)");

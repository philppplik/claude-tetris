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
import { writePanes } from "../lib/panes.mjs";
import { focusCommand, focusEnabled } from "../lib/focus.mjs";

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
  has,
  prefer,
  // --dry-run --backend=X zeigt X's Kommando auch dort, wo X nicht läuft.
  // Ein blankes --dry-run prüft dagegen echt: sonst verspräche es eine Pane,
  // die der echte Lauf gar nicht öffnen kann.
  force: dryRun && Boolean(prefer),
});

if (!plan.backend) {
  console.error(`${plan.reason}\n`);
  console.error(fallbackHelp(process.platform));
  process.exit(1);
}

if (dryRun) {
  console.log(`DRY-RUN backend=${plan.backend}`);
  console.log(`DRY-RUN ${plan.command} ${plan.args.map((a) => JSON.stringify(a)).join(" ")}`);
  process.exit(0);
}

console.log(`Opening the split pane via ${plan.backend}...`);
console.log(`   Claude Code:   ${projectDir}`);
console.log(`   claude-tetris: ${PLUGIN_DIR}`);
console.log("");

// shell:false ist wichtig: sonst interpretiert eine weitere Shell-Ebene das
// ';' als Separator und zerlegt die Quotes.
// stdout wird abgefangen, weil manche Backends die ID der neuen Pane dort
// ausgeben — die brauchen wir für den Autofokus.
const capture = Boolean(plan.panes?.capture);
const r = spawnSync(plan.command, plan.args, {
  stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  shell: false,
  encoding: "utf8",
});
if (r.error) {
  console.error(`Could not start ${plan.command}: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`${plan.command} exited with code ${r.status}.`);
  process.exit(r.status ?? 1);
}

// Pane-Kennungen ablegen: die Hooks laufen später in einem anderen Prozess und
// wüssten sonst nicht, wohin der Fokus gehört.
const ids = capture ? String(r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean) : [];
const panes = {
  backend: plan.backend,
  window: plan.panes?.window ?? null,
  // iTerm liefert beide IDs (erst Claude, dann Spiel), alle anderen nur die neue.
  claude: plan.panes?.pair ? ids[0] ?? null : plan.panes?.claude ?? null,
  game: plan.panes?.pair ? ids[1] ?? null : ids[0] ?? null,
};
const stored = writePanes(panes);

// Fokus zurück zu Claude: nach dem Start will man tippen, nicht spielen.
// Bewusst über denselben Weg wie im Spielbetrieb — funktioniert das hier
// nicht, funktioniert auch der Autofokus später nicht, und das merkt man sofort.
if (stored && focusEnabled()) {
  const back = focusCommand(panes, "claude");
  if (back) spawnSync(back.command, back.args, { stdio: "ignore", shell: false });
}

console.log("Pane open. Tetris pauses automatically once Claude is done.");
if (stored && focusEnabled() && focusCommand(panes, "game")) {
  console.log("   Focus follows you: the game pane on submit, Claude's on reply.");
  console.log("   Set CLAUDE_TETRIS_FOCUS=0 to keep focus where you put it.");
}
console.log("   (Q or Ctrl+C in the Tetris pane quits the game.)");

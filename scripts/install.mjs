#!/usr/bin/env node
// scripts/install.mjs — Installiert claude-tetris als Claude-Code-Plugin.
//
// Strategie: Die bestehende ~/.claude/settings.json wird NICHT überschrieben,
// sondern um unsere Hook-Einträge ERGÄNZT (merge). Bereits vorhandene Hooks
// (z.B. rune-kit) bleiben erhalten. Ein Backup wird vorher angelegt.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(__dirname, ".."); // claude-tetris/
const SIGNAL = path.join(PLUGIN_DIR, "scripts", "tetris-signal.mjs");
const CLAUDE_HOME =
  (process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")).replace(/[/\\]$/, "");
const SETTINGS = path.join(CLAUDE_HOME, "settings.json");

const PLAY_CMD = `node "${SIGNAL}" play`;
const PAUSE_CMD = `node "${SIGNAL}" pause`;

function loadSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch (e) {
    console.error(`⚠ settings.json ist kein gültiges JSON: ${e.message}`);
    process.exit(1);
  }
}

function backup() {
  if (!fs.existsSync(SETTINGS)) {
    console.log("💾 Keine bestehende settings.json — kein Backup nötig");
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${SETTINGS}.claude-tetris-backup-${ts}`;
  fs.copyFileSync(SETTINGS, dest);
  console.log(`💾 Backup: ${dest}`);
}

function addHook(hooks, event, command) {
  if (!hooks[event]) hooks[event] = [];
  // Vermeide doppelte Einträge (gleiches Command)
  const exists = hooks[event].some((entry) =>
    entry.hooks?.some((h) => h.command === command)
  );
  if (exists) {
    console.log(`  • ${event}: bereits vorhanden, übersprungen`);
    return;
  }
  hooks[event].push({
    matcher: ".*",
    hooks: [{ type: "command", command, async: true }],
  });
  console.log(`  ✓ ${event}: Hook hinzugefügt`);
}

function main() {
  console.log(`\n🎮 claude-tetris installieren…`);
  console.log(`   Plugin: ${PLUGIN_DIR}`);
  console.log(`   Ziel:  ${SETTINGS}\n`);

  const settings = loadSettings();
  backup();

  settings.hooks = settings.hooks || {};
  addHook(settings.hooks, "UserPromptSubmit", PLAY_CMD);
  addHook(settings.hooks, "Stop", PAUSE_CMD);

  // Plugin registrieren (für marketplace-freie lokale Installation)
  settings.enabledPlugins = settings.enabledPlugins || {};
  settings.enabledPlugins["claude-tetris@local"] = true;

  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log(`\n✅ Fertig. claude-tetris ist in Claude Code aktiv.`);
  console.log(`   Starte Claude Code neu, damit die Hooks greifen.`);
  console.log(`   Teste mit: node bin/tetris.mjs\n`);
}

main();

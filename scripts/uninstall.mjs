#!/usr/bin/env node
// scripts/uninstall.mjs — Entfernt claude-tetris Hooks aus ~/.claude/settings.json.
// Lässt alle anderen Hooks (z.B. rune-kit) unberührt.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(__dirname, "..");
const SIGNAL = path.join(PLUGIN_DIR, "scripts", "tetris-signal.mjs");
const CLAUDE_HOME =
  (process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")).replace(/[/\\]$/, "");
const SETTINGS = path.join(CLAUDE_HOME, "settings.json");

const PLAY_CMD = `node "${SIGNAL}" play`;
const PAUSE_CMD = `node "${SIGNAL}" pause`;

function main() {
  console.log(`\n🗑  claude-tetris deinstallieren…\n`);
  if (!fs.existsSync(SETTINGS)) {
    console.log(`   Keine settings.json gefunden — nichts zu tun.`);
    return;
  }
  const settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  const hooks = settings.hooks || {};

  for (const event of ["UserPromptSubmit", "Stop"]) {
    if (!hooks[event]) continue;
    const before = hooks[event].length;
    hooks[event] = hooks[event].filter(
      (entry) =>
        !(entry.hooks || []).some(
          (h) => h.command === PLAY_CMD || h.command === PAUSE_CMD
        )
    );
    const removed = before - hooks[event].length;
    if (removed > 0) console.log(`  ✓ ${event}: ${removed} Hook(s) entfernt`);
    else console.log(`  • ${event}: keine claude-tetris Hooks gefunden`);
    if (hooks[event].length === 0) delete hooks[event];
  }

  if (settings.enabledPlugins) delete settings.enabledPlugins["claude-tetris@local"];

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(SETTINGS, `${SETTINGS}.claude-tetris-backup-${ts}`);
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log(`\n✅ claude-tetris entfernt. Backup angelegt.`);
}

main();

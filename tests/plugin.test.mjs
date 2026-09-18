// tests/plugin.test.mjs — Die Plugin- und Marketplace-Manifeste müssen dem
// Claude-Code-Schema entsprechen UND untereinander konsistent bleiben.
// Versionen driften sonst lautlos auseinander und User bekommen kein Update.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const pkg = read("package.json");
const plugin = read(".claude-plugin/plugin.json");
const market = read(".claude-plugin/marketplace.json");
const hooks = read("hooks/hooks.json");

test("plugin.json liegt am Spec-Ort und hat die Pflichtfelder", () => {
  assert.ok(fs.existsSync(path.join(ROOT, ".claude-plugin", "plugin.json")));
  assert.equal(plugin.name, "claude-tetris");
  assert.match(plugin.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case");
  assert.ok(plugin.description);
  assert.ok(plugin.author?.name);
});

test("marketplace.json hat name, owner und plugins", () => {
  assert.match(market.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case");
  assert.ok(market.owner?.name, "owner.name ist Pflicht");
  assert.ok(Array.isArray(market.plugins) && market.plugins.length > 0);
  for (const p of market.plugins) {
    assert.ok(p.name, "jeder Eintrag braucht name");
    assert.ok(p.source, "jeder Eintrag braucht source");
  }
});

test("marketplace.json nutzt keinen für Anthropic reservierten Namen", () => {
  // Reservierte Namen laden nicht mehr und melden 'untrusted source'.
  const reserved = new Set([
    "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
    "claude-plugins-community", "claude-community", "anthropic-marketplace",
    "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
    "knowledge-work-plugins", "life-sciences", "claude-for-legal",
    "claude-for-financial-services", "financial-services-plugins",
    "first-party-plugins", "claude-tag-plugins", "healthcare",
    "npm", "pip", "uv", "cargo", "github", "gh",
  ]);
  assert.equal(reserved.has(market.name.toLowerCase()), false);
});

test("Versionen von package.json, plugin.json und marketplace.json sind identisch", () => {
  const entry = market.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, "Plugin ist im Marketplace gelistet");
  assert.equal(plugin.version, pkg.version, "plugin.json vs package.json");
  assert.equal(entry.version, pkg.version, "marketplace.json vs package.json");
});

test("Plugin-Quelle zeigt auf das Repo-Root (scripts/ muss mitkopiert werden)", () => {
  const entry = market.plugins.find((p) => p.name === plugin.name);
  // Kopierte Plugins können NICHT via ../ nach draußen greifen. Die Hooks
  // rufen scripts/tetris-signal.mjs — das muss also im Plugin-Verzeichnis
  // liegen, deshalb ist die Plugin-Wurzel das Repo-Root.
  assert.equal(entry.source, "./");
});

test("Hook-Kommandos nutzen ${CLAUDE_PLUGIN_ROOT} und zeigen auf echte Dateien", () => {
  const cmds = Object.values(hooks.hooks)
    .flat()
    .flatMap((e) => e.hooks)
    .map((h) => h.command);
  assert.ok(cmds.length >= 2);
  for (const c of cmds) {
    assert.ok(c.includes("${CLAUDE_PLUGIN_ROOT}"), `kein Platzhalter in: ${c}`);
    assert.ok(!c.includes("<plugin_dir>"), "alter Platzhalter übrig");
    const rel = c.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/)[1];
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `referenziert fehlende Datei: ${rel}`);
  }
});

test("UserPromptSubmit spielt, Stop pausiert", () => {
  const cmd = (ev) => hooks.hooks[ev][0].hooks[0].command;
  assert.match(cmd("UserPromptSubmit"), /\bplay$/);
  assert.match(cmd("Stop"), /\bpause$/);
});

test("package.json files enthält alles, was das Plugin zur Laufzeit braucht", () => {
  for (const needed of ["scripts/", "commands/", "hooks/", ".claude-plugin/", "game/", "lib/"]) {
    assert.ok(pkg.files.includes(needed), `fehlt in files: ${needed}`);
  }
});

test("Slash-Command liegt am Spec-Ort und hat eine description", () => {
  const md = fs.readFileSync(path.join(ROOT, "commands", "tetris.md"), "utf8");
  assert.match(md, /^---\r?\ndescription: .+/m, "Frontmatter mit description");
});

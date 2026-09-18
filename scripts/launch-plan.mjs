// scripts/launch-plan.mjs — Reine Launcher-Logik: welcher Terminal-Backend
// kann eine Split-Pane bauen, und mit welchem argv?
//
// Kein I/O, keine Seiteneffekte — damit jeder Backend-Pfad testbar ist, auch
// die, die auf der aktuellen Plattform gar nicht laufen können. launch.mjs ist
// nur noch der Ausführer.

import path from "node:path";

/**
 * Name des Windows-Terminal-Fensters. Ein benanntes Fenster laesst sich spaeter
 * eindeutig adressieren; existiert es nicht, legt wt.exe es an.
 */
export const WT_WINDOW = "claude-tetris";

/** Reihenfolge der Backends. Erstes verfügbares gewinnt. */
export const BACKENDS = ["wt", "tmux", "iterm", "kitty", "wezterm"];

/**
 * Baut den Start-Plan.
 *
 * @param {object} o
 * @param {string} o.projectDir   Verzeichnis, in dem Claude Code startet
 * @param {string} o.pluginDir    Wurzel dieses Pakets (enthält bin/tetris.mjs)
 * @param {string} o.platform     process.platform
 * @param {(cmd: string) => boolean} o.has  ist das Kommando aufrufbar?
 * @param {Record<string,string>} [o.env]   process.env (für TMUX-Erkennung)
 * @param {number} [o.size]       Breitenanteil der Tetris-Pane (0..1)
 * @param {string} [o.prefer]     Backend erzwingen (--backend=…)
 * @param {boolean} [o.force]     Verfügbarkeitsprüfung für `prefer` überspringen.
 *   Nur für --dry-run: „zeig mir, wie das tmux-Kommando aussähe" soll auch auf
 *   einer Maschine ohne tmux funktionieren.
 * @returns {{backend: string, command: string, args: string[], inherit: boolean}
 *          | {backend: null, reason: string, tried: string[]}}
 */
export function planLaunch(o) {
  const {
    projectDir,
    pluginDir,
    platform,
    has,
    env = {},
    size = 0.38,
    prefer = null,
    force = false,
  } = o;

  const tetris = `node ${q(path.join(pluginDir, "bin", "tetris.mjs"))}`;
  const ctx = { projectDir, pluginDir, tetris, size, env };

  if (prefer && !BUILDERS[prefer]) {
    return {
      backend: null,
      tried: [prefer],
      reason: `Unknown backend "${prefer}". Available: ${BACKENDS.join(", ")}.`,
    };
  }
  if (prefer && force) {
    return { backend: prefer, inherit: true, ...BUILDERS[prefer](ctx) };
  }

  const order = prefer ? [prefer] : BACKENDS;
  const tried = [];

  for (const name of order) {
    const build = BUILDERS[name];
    if (!build) continue;
    tried.push(name);
    if (!available(name, { platform, has, env })) continue;
    return { backend: name, inherit: true, ...build(ctx) };
  }

  return {
    backend: null,
    tried,
    reason: prefer
      ? `Backend "${prefer}" is not usable here.`
      : "No supported terminal for split panes found.",
  };
}

/** Kann dieses Backend hier eine Pane aufmachen? */
function available(name, { platform, has, env }) {
  switch (name) {
    case "wt":
      return platform === "win32" && has("wt.exe");
    // tmux kann nur splitten, wenn wir bereits IN einer tmux-Session sitzen —
    // sonst gäbe es kein Fenster, das man teilen könnte.
    case "tmux":
      return platform !== "win32" && has("tmux") && Boolean(env.TMUX);
    case "iterm":
      return platform === "darwin" && env.TERM_PROGRAM === "iTerm.app" && has("osascript");
    case "kitty":
      return platform !== "win32" && has("kitty") && Boolean(env.KITTY_WINDOW_ID);
    case "wezterm":
      return has("wezterm") && Boolean(env.WEZTERM_PANE);
    default:
      return false;
  }
}

const BUILDERS = {
  // Windows Terminal: neuer Tab mit Claude, dann vertikaler Split mit Tetris.
  // shell:false ist Pflicht — sonst frisst eine zweite cmd.exe-Ebene das ';'.
  wt: ({ projectDir, pluginDir, tetris, size }) => ({
    command: "wt.exe",
    // Benanntes Fenster: spaeter adressieren wir GENAU dieses fuer den
    // Fokuswechsel. Mit "-w 0" (zuletzt benutztes Fenster) wuerde man bei
    // mehreren offenen Terminals das falsche erwischen.
    panes: { window: WT_WINDOW, capture: false },
    args: [
      "-w", WT_WINDOW,
      "new-tab",
      "--title", "Claude Code",
      "cmd", "/k", `cd /d ${q(projectDir)} && claude`,
      ";",
      "split-pane", "--size", String(size),
      "--title", "claude-tetris",
      "cmd", "/k", `cd /d ${q(pluginDir)} && ${tetris}`,
    ],
  }),

  // tmux: die AKTUELLE Pane ist Claude Code. Wir haengen Tetris rechts daneben.
  // -P -F gibt die ID der neuen Pane auf stdout aus, damit der Autofokus sie
  // spaeter gezielt ansteuern kann. Den Fokus zurueckzugeben uebernimmt der
  // Launcher selbst — so laeuft es ueber denselben Weg wie im Spielbetrieb.
  tmux: ({ pluginDir, tetris, size, env }) => ({
    command: "tmux",
    panes: { claude: env.TMUX_PANE ?? null, capture: true },
    args: [
      "split-window", "-h",
      "-P", "-F", "#{pane_id}",
      "-p", String(Math.round(size * 100)),
      "-c", pluginDir,
      tetris,
    ],
  }),

  // iTerm2 hat keine CLI für Splits — AppleScript ist der offizielle Weg.
  iterm: ({ pluginDir, tetris }) => ({
    command: "osascript",
    // AppleScript gibt die Session-IDs zurueck: erst Claude, dann das Spiel.
    panes: { capture: true, pair: true },
    args: [
      "-e", 'tell application "iTerm2"',
      "-e", "tell current session of current window",
      "-e", "set oldId to id",
      "-e", "set newSession to (split vertically with default profile)",
      "-e", "end tell",
      "-e", "tell newSession",
      "-e", `write text ${aq(`cd ${q(pluginDir)} && ${tetris}`)}`,
      "-e", "set newId to id",
      "-e", "end tell",
      "-e", "end tell",
      "-e", "return oldId & \"\n\" & newId",
    ],
  }),

  // kitty @ launch gibt die ID des neuen Fensters auf stdout aus.
  kitty: ({ pluginDir, tetris, env }) => ({
    command: "kitty",
    panes: { claude: env.KITTY_WINDOW_ID ?? null, capture: true },
    args: [
      "@", "launch",
      "--location", "vsplit",
      "--cwd", pluginDir,
      "--title", "claude-tetris",
      "sh", "-c", tetris,
    ],
  }),

  // wezterm cli split-pane gibt die ID der neuen Pane auf stdout aus.
  wezterm: ({ pluginDir, tetris, size, env }) => ({
    command: "wezterm",
    panes: { claude: env.WEZTERM_PANE ?? null, capture: true },
    args: [
      "cli", "split-pane",
      "--right",
      "--percent", String(Math.round(size * 100)),
      "--cwd", pluginDir,
      "--", "sh", "-c", tetris,
    ],
  }),
};

/** Shell-Quoting für Pfade mit Leerzeichen. */
function q(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

/** AppleScript-String-Literal. */
function aq(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Menschenlesbarer Hinweis, wenn kein Backend passt. */
export function fallbackHelp(platform) {
  const lines = ["Supported terminals:"];
  if (platform === "win32") {
    lines.push("  - Windows Terminal (wt.exe), from the Microsoft Store");
  } else {
    lines.push("  - tmux     run `tmux` first, then launch from inside the session");
    lines.push("  - kitty    needs `allow_remote_control` enabled");
    lines.push("  - WezTerm  `wezterm cli` only works from inside WezTerm");
    if (platform === "darwin") lines.push("  - iTerm2   must be the active terminal");
  }
  lines.push(
    "",
    "Or just open a second terminal window and run `claude-tetris` there.",
    "The pause coupling goes through the signal file, so it works across windows too.",
  );
  return lines.join("\n");
}

// scripts/launch-plan.mjs — Reine Launcher-Logik: welcher Terminal-Backend
// kann eine Split-Pane bauen, und mit welchem argv?
//
// Kein I/O, keine Seiteneffekte — damit jeder Backend-Pfad testbar ist, auch
// die, die auf der aktuellen Plattform gar nicht laufen können. launch.mjs ist
// nur noch der Ausführer.

import path from "node:path";

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
  } = o;

  const tetris = `node ${q(path.join(pluginDir, "bin", "tetris.mjs"))}`;
  const ctx = { projectDir, pluginDir, tetris, size, env };

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
      ? `Backend "${prefer}" ist hier nicht verfügbar.`
      : "Kein unterstütztes Terminal für Split-Panes gefunden.",
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
    args: [
      "new-tab",
      "--title", "Claude Code",
      "cmd", "/k", `cd /d ${q(projectDir)} && claude`,
      ";",
      "split-pane", "--size", String(size),
      "--title", "claude-tetris",
      "cmd", "/k", `cd /d ${q(pluginDir)} && ${tetris}`,
    ],
  }),

  // tmux: die AKTUELLE Pane ist Claude Code. Wir hängen Tetris rechts daneben
  // und geben den Fokus zurück, damit weitergetippt werden kann.
  tmux: ({ pluginDir, tetris, size }) => ({
    command: "tmux",
    args: [
      "split-window", "-h",
      "-p", String(Math.round(size * 100)),
      "-c", pluginDir,
      tetris,
      ";",
      "last-pane",
    ],
  }),

  // iTerm2 hat keine CLI für Splits — AppleScript ist der offizielle Weg.
  iterm: ({ pluginDir, tetris }) => ({
    command: "osascript",
    args: [
      "-e", 'tell application "iTerm2"',
      "-e", "tell current session of current window",
      "-e", `set newSession to (split vertically with default profile)`,
      "-e", "end tell",
      "-e", "tell newSession",
      "-e", `write text ${aq(`cd ${q(pluginDir)} && ${tetris}`)}`,
      "-e", "end tell",
      "-e", "end tell",
    ],
  }),

  kitty: ({ pluginDir, tetris }) => ({
    command: "kitty",
    args: [
      "@", "launch",
      "--location", "vsplit",
      "--cwd", pluginDir,
      "--title", "claude-tetris",
      "sh", "-c", tetris,
    ],
  }),

  wezterm: ({ pluginDir, tetris, size }) => ({
    command: "wezterm",
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
  const lines = [
    "Kein Terminal mit Split-Panes gefunden.",
    "",
    "Unterstützt werden:",
  ];
  if (platform === "win32") {
    lines.push("  • Windows Terminal (wt.exe) — aus dem Microsoft Store");
  } else {
    lines.push("  • tmux    — starte `tmux`, dann in der Session erneut launchen");
    lines.push("  • kitty   — mit aktiviertem `allow_remote_control`");
    lines.push("  • WezTerm — `wezterm cli` läuft nur innerhalb von WezTerm");
    if (platform === "darwin") lines.push("  • iTerm2  — als aktives Terminal");
  }
  lines.push(
    "",
    "Alternativ: öffne einfach ein zweites Terminal und starte dort `claude-tetris`.",
    "Die Pause-Kopplung läuft über die Signal-Datei und funktioniert fensterübergreifend.",
  );
  return lines.join("\n");
}

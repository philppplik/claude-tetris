// lib/focus.mjs — Welches Kommando holt den Tastaturfokus in welche Pane?
//
// Reine Logik, keine Ausführung — damit jedes Terminal-Backend auf jeder
// Maschine testbar bleibt, genau wie bei launch-plan.mjs.
//
// Ablauf im Spielbetrieb:
//   Prompt abgeschickt  -> UserPromptSubmit-Hook -> Fokus auf das Spiel
//   Claude ist fertig   -> Stop-Hook            -> Fokus zurück zu Claude
//
// Damit muss man zwischen Tippen und Spielen nie klicken.

/** @typedef {"game"|"claude"} Target */

/**
 * @param {import("./panes.mjs").Panes|null} panes
 * @param {Target} target
 * @returns {{command: string, args: string[]}|null} null = hier nicht möglich
 */
export function focusCommand(panes, target) {
  if (!panes || (target !== "game" && target !== "claude")) return null;

  switch (panes.backend) {
    // Windows Terminal kennt kein focus-pane (nur focus-tab für Tabs).
    // move-focus ist richtungsbasiert — passt exakt zu unserem Layout
    // (Claude links, Spiel rechts) und ist ein No-op, wenn der Fokus schon
    // dort steht. Das benannte Fenster verhindert, dass wir bei mehreren
    // offenen Terminals das falsche erwischen.
    case "wt": {
      if (!panes.window) return null;
      return {
        command: "wt.exe",
        args: ["-w", panes.window, "move-focus", target === "game" ? "right" : "left"],
      };
    }

    case "tmux": {
      const id = target === "game" ? panes.game : panes.claude;
      if (!id) return null;
      return { command: "tmux", args: ["select-pane", "-t", id] };
    }

    case "wezterm": {
      const id = target === "game" ? panes.game : panes.claude;
      if (!id) return null;
      return { command: "wezterm", args: ["cli", "activate-pane", "--pane-id", id] };
    }

    case "kitty": {
      const id = target === "game" ? panes.game : panes.claude;
      if (!id) return null;
      return { command: "kitty", args: ["@", "focus-window", "--match", `id:${id}`] };
    }

    case "iterm": {
      const id = target === "game" ? panes.game : panes.claude;
      if (!id) return null;
      return {
        command: "osascript",
        args: ["-e", `tell application "iTerm2" to tell session id "${id}" to select`],
      };
    }

    default:
      return null;
  }
}

/** Autofokus ist an, außer der User schaltet ihn ab. */
export function focusEnabled(env = process.env) {
  return !/^(0|false|no|off)$/i.test(env.CLAUDE_TETRIS_FOCUS ?? "");
}

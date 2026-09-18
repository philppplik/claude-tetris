# Roadmap

> Play Tetris while Claude Code is cooking. The moment Claude finishes, the game
> pauses — and it resumes as soon as Claude starts working again.

Status: shipped through the launcher. Polish is in progress; distribution is next.

---

## The core idea

While Claude Code generates a response you often wait seconds to minutes. That
wait becomes a playable game, and the game's state is tied to Claude's:

| Claude                     | Tetris             |
| -------------------------- | ------------------ |
| generating / working       | running (playable) |
| finished / awaiting input  | paused             |
| awaiting permission        | paused (planned)   |

---

## Why the game needs its own surface

A playable Tetris **cannot** run inside Claude Code's own window:

- **Hooks have no terminal.** A hook process cannot open `/dev/tty` or send
  escape sequences to the Claude Code interface. It is a short-lived command that
  reports an event — it cannot draw and cannot receive keys.
- **The status line is output only.** It renders text at the bottom of the
  window, refreshes at most once per second, and receives no keyboard input. That
  would allow a self-playing ghost Tetris at best.
- **Claude Code owns the terminal and keyboard** while it runs. Keystrokes go to
  its message queue, not to a game.

So the game gets its own pane, which is the closest thing to "next to Claude, in
the same window":

```
┌──────────────────────────────┬──────────────────┐
│   Claude Code                │   TETRIS         │
│   (left pane)                │   (right pane)   │
│                              │                  │
│   > build me an API...       │   [board]        │
│   cooking...                 │   Score: 1200    │
│                              │   PLAYING        │
└──────────────────────────────┴──────────────────┘
```

Each pane has its own keyboard, so the right one is genuinely playable. Hooks in
Claude Code write play/pause signals that the game reads.

---

## Architecture

**A — the TUI** (`game/`). A long-running Node process. ANSI rendering, raw
keyboard, full Tetris loop: 7 tetrominoes, SRS rotation with wall kicks, line
clears, levels, scoring, next queue, hold, ghost piece, game over and restart.
It watches the signal channel and freezes on `PAUSE`.

**B — the signal channel** (`lib/signal.mjs`). A JSON state file, written
atomically via temp file plus rename and read tolerantly. A plain file beats
sockets and named pipes for cross-platform robustness, and it couples across
windows, not just panes. The TUI uses `fs.watch`, so reaction is immediate.

**C — the plugin** (`.claude-plugin/`, `hooks/`, `commands/`). Maps hook events
to signals:

| Event              | When                          | Action  |
| ------------------ | ----------------------------- | ------- |
| `UserPromptSubmit` | prompt submitted, cook starts | PLAY    |
| `Stop`             | Claude finished               | PAUSE   |
| `Notification`     | Claude needs permission       | PAUSE (planned) |

**D — the launcher** (`scripts/`). Backend selection is a pure function in
`launch-plan.mjs`; `launch.mjs` executes the resulting plan.

---

## Phases

- [x] **0 — Setup.** Project structure, signal module, isolated tests.
- [x] **1 — Headless core.** Board, tetrominoes, rotation, line clears, scoring.
- [x] **2 — TUI.** ANSI rendering, raw keyboard, game loop.
- [x] **3 — Pause coupling.** The TUI reacts to the signal file.
- [x] **4 — Plugin and hooks.** Play/pause switches automatically.
- [x] **5 — Launcher.** Split pane on Windows Terminal, tmux, iTerm2, kitty and
      WezTerm, with a documented cross-window fallback.
- [ ] **6 — Polish.** Colours and README are done. Open:
  - **Lock delay + DAS/ARR.** Pieces currently lock on contact, so there is no
    slide and no T-spin finish. This is the gap between "Tetris-like" and "feels
    right".
  - **Highscore persistence.** The score is lost when the pane closes.
  - **Pause on permission prompts** via the `Notification` hook, as an option.
- [ ] **7 — Distribution.** Marketplace manifest shipped; announce and list it.

---

## Decided along the way

- **Polling vs. file watching** — resolved: `fs.watch`, not a 100 ms poll.
- **Fallback without Windows Terminal** — resolved: `scripts/launch-plan.mjs`
  picks from five terminals, and with no match it points at the second-window
  fallback, which works because the signal file couples across windows.
- **Plugin root** — resolved: the repository root is the plugin root. Claude Code
  copies a plugin into its cache and a copied plugin cannot reach outside its own
  directory with `../`, so `scripts/` has to live inside it.

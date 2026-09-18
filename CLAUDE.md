# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

claude-tetris is a playful plugin that runs Tetris in a split-pane alongside Claude Code. The game automatically plays when Claude is thinking and pauses when Claude finishes (waiting for your next prompt). Controlled via Claude Code hooks that write to a signal file.

## Architecture

```
claude-tetris/
├── game/
│   ├── core.mjs      # Headless Tetris engine (testable, no I/O)
│   └── tui.mjs       # Terminal UI with ANSI rendering, keyboard input, signal watching
├── lib/
│   └── signal.mjs    # Atomic state file communication (Claude hook ↔ TUI)
├── scripts/
│   ├── install.mjs   # Merges hooks into ~/.claude/settings.json
│   ├── uninstall.mjs # Removes claude-tetris hooks only
│   ├── launch.mjs    # Split-pane launcher (executes the plan)
│   ├── launch-plan.mjs # Pure backend selection (wt/tmux/iTerm2/kitty/wezterm)
│   └── tetris-signal.mjs # Hook bridge: play/pause/status commands
├── bin/
│   └── tetris.mjs    # Binary entry point (npx claude-tetris)
├── .claude-plugin/
│   ├── plugin.json   # Plugin manifest (spec location)
│   └── marketplace.json # Marketplace catalogue
├── hooks/
│   └── hooks.json    # UserPromptSubmit -> play, Stop -> pause
└── commands/
    └── tetris.md     # /tetris slash command
```

### Key Architecture Decisions

1. **Headless Engine** (`game/core.mjs`) - No terminal I/O, fully testable business logic
2. **TUI Wrapper** (`game/tui.mjs`) - Handles ANSI rendering, raw keyboard, game loop, and `fs.watch` on the signal file (with a polling fallback if the watch cannot be established)
3. **Signal Channel** (`lib/signal.mjs`) - Atomic JSON file writes via temp+rename, tolerant reads. Avoids Windows socket/pipe limitations.
4. **Hook Merge Strategy** - Installs don't overwrite existing hooks; backups are created automatically.
5. **Plugin Root = Repo Root** - Claude Code copies plugins into a cache and a copied plugin cannot reach outside its directory via `../`. Since the hooks invoke `scripts/tetris-signal.mjs`, the plugin root must be the repository root. Hook commands use `${CLAUDE_PLUGIN_ROOT}`.
6. **Launcher Split** (`scripts/launch-plan.mjs`) - Backend selection is a pure function taking `platform`/`env`/`has()`, so every terminal backend is testable from any machine. `launch.mjs` only executes the returned plan.

## Development Commands

```bash
npm start           # Run Tetris in current terminal
npm test            # Run all tests
npm run install:hooks    # Install hooks into ~/.claude/settings.json
npm run uninstall:hooks  # Remove claude-tetris hooks
npm run launch      # Open a split pane (Claude left, Tetris right)
```

### Single Test Execution

```bash
node --test tests/core.test.mjs
node --test tests/ghost.test.mjs
node --test tests/ui.test.mjs
node --test tests/integration.test.mjs
node --test tests/launch.test.mjs
node --test tests/cli.test.mjs
node --test tests/plugin.test.mjs
```

## Testing Strategy

- **Node.js built-in test runner** - No external test framework dependency
- **Covered**: SRS rotation, line clears, 7-bag randomizer, game over, hold, ghost piece, rendering, keyboard input, pause integration, install/uninstall, launcher backend selection, CLI dispatch, plugin/marketplace manifests
- **No machine-dependent tests** - never seed a fixture from the user's real `~/.claude/settings.json`; build synthetic fixtures instead

## Hooks Flow

1. `UserPromptSubmit` → `tetris-signal.mjs play` → state.json = `{ "state": "PLAY" }` → Game unfreezes
2. `Stop` → `tetris-signal.mjs pause` → state.json = `{ "state": "PAUSE" }` → Game pauses with "⏸ Claude ist fertig"

## Code Style

- ES modules (Node.js >=18), zero runtime dependencies - keep it that way
- Conventional Commits (`fix(core): ...`, `feat(launch): ...`); explain *why* in the body
- Headless core module for logic, TUI module for presentation
- Atomic writes for signal file to prevent race conditions
- Decisions belong in pure functions that tests can call directly; I/O modules just execute (see `launch-plan.mjs` vs `launch.mjs`)
- Version lives in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; `tests/plugin.test.mjs` enforces they match
- German comments in source, English user strings in UI
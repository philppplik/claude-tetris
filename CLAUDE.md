# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

claude-tetris is a playful plugin that runs Tetris in a split-pane alongside Claude Code. The game automatically plays when Claude is thinking and pauses when Claude finishes (waiting for your next prompt). Controlled via Claude Code hooks that write to a signal file.

## Architecture

```
claude-tetris/
├── game/
│   ├── core.mjs      # Headless Tetris engine (testable, no I/O)
│   └── tui.mjs       # Terminal UI with ANSI rendering, keyboard input, signal polling
├── lib/
│   └── signal.mjs    # Atomic state file communication (Claude hook ↔ TUI)
├── scripts/
│   ├── install.mjs   # Merges hooks into ~/.claude/settings.json
│   ├── uninstall.mjs # Removes claude-tetris hooks only
│   ├── launch.mjs    # Windows Terminal split-pane launcher
│   └── tetris-signal.mjs # Hook bridge: play/pause/status commands
├── bin/
│   └── tetris.mjs    # Binary entry point (npx claude-tetris)
└── claude-code/
    ├── hooks.json    # Hook template for installation
    └── plugin.json   # Plugin manifest
```

### Key Architecture Decisions

1. **Headless Engine** (`game/core.mjs`) - No terminal I/O, fully testable business logic
2. **TUI Wrapper** (`game/tui.mjs`) - Handles ANSI rendering, raw keyboard, game loop, and signal polling every 100ms
3. **Signal Channel** (`lib/signal.mjs`) - Atomic JSON file writes via temp+rename, tolerant reads. Avoids Windows socket/pipe limitations.
4. **Hook Merge Strategy** - Installs don't overwrite existing hooks; backups are created automatically.

## Development Commands

```bash
npm start           # Run Tetris in current terminal
npm test            # Run all tests (44 tests, ~1s)
npm run install:hooks    # Install hooks into ~/.claude/settings.json
npm run uninstall:hooks  # Remove claude-tetris hooks
npm run launch      # Open Windows Terminal split-pane (Claude left, Tetris right)
```

### Single Test Execution

```bash
node --test tests/core.test.mjs
node --test tests/ghost.test.mjs
node --test tests/ui.test.mjs
node --test tests/integration.test.mjs
```

## Testing Strategy

- **Node.js built-in test runner** - No external test framework dependency
- **44 tests covering**: SRS rotation, line clears, 7-bag randomizer, game over, hold, ghost piece, rendering, keyboard input, pause integration, install/uninstall

## Hooks Flow

1. `UserPromptSubmit` → `tetris-signal.mjs play` → state.json = `{ "state": "PLAY" }` → Game unfreezes
2. `Stop` → `tetris-signal.mjs pause` → state.json = `{ "state": "PAUSE" }` → Game pauses with "⏸ Claude ist fertig"

## Code Style

- ES modules (Node.js >=18)
- Headless core module for logic, TUI module for presentation
- Atomic writes for signal file to prevent race conditions
- German comments in source, English user strings in UI
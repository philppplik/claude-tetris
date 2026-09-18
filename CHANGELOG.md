# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-18

### Added

- **Focus follows the conversation.** Submitting a prompt moves the keyboard
  focus to the game pane; Claude's reply moves it back. No more clicking between
  typing and playing. Permission prompts always pull focus back to Claude, so a
  question is never answered into the game. Disable with `CLAUDE_TETRIS_FOCUS=0`.

  The launcher records which pane is which in `~/.claude-tetris/panes.json`,
  because the hooks run in a different process later and cannot know.

- **A "terminal too small" screen** instead of a layout torn across the edges.

### Changed

- **Responsive layout.** Panels now drop by priority as the pane narrows —
  first the key hints, then HOLD, then NEXT — and the board itself is never
  sacrificed. Status text is truncated rather than wrapped.
- Ghost piece is drawn as an outline, matching the demo GIF.
- Double buffering actually skips writes now: an unchanged frame is not
  redrawn, which stops the gravity timer from flickering a static board.

### Fixed

- **The hold slot was still invisible.** Fixing the engine in 0.3.0 was only
  half of it — `game/tui.mjs` still read `game.old`, the field that bug
  introduced, so nothing was ever drawn in the HOLD box.
- The key-hint line was drawn on top of the bottom border.
- The "terminal too small" message itself overflowed a narrow terminal.

## [0.3.1] - 2026-09-18

Documentation only. No code changes — the published package is byte-for-byte
identical apart from the README.

### Added

- A demo GIF at the top of the README, generated reproducibly by
  `tools/record-demo.mjs` from the real engine with a fixed seed.

npm renders the README from the published tarball, so the GIF only reaches
npmjs.com with a release. Relative paths need no rewriting: npm resolves them
against the repository automatically.

## [0.3.0] - 2026-09-18

First release since 0.1.0. Version 0.2.0 was prepared in git but never tagged or
published, so everything from it ships here.

### Added

#### Game feel

- **Lock delay** (500 ms, max 15 resets). A piece that lands stays movable, so
  slides and spin finishes are possible. The reset budget is capped so wiggling
  cannot stall a piece forever.
- **DAS/ARR** with modern competitive defaults (DAS 100 ms, ARR 0): tap to nudge
  one cell, hold to slide to the wall. Tunable via `CLAUDE_TETRIS_DAS` and
  `CLAUDE_TETRIS_ARR`.
- **Persistent highscore** in `~/.claude-tetris/highscore.json`, shown as `BEST`
  in the side panel. Written atomically; a corrupt file never blocks the game.
- **Pause on permission prompts** via the `Notification` hook, so a prompt is not
  missed while playing. Disable with `CLAUDE_TETRIS_PAUSE_ON_PERMISSION=0`.

  Note on DAS: a terminal in raw mode has no key-up event, so a held key is
  inferred from the OS auto-repeat stream. Its initial delay (250–500 ms) is a
  floor `CLAUDE_TETRIS_DAS` cannot go below; it applies after auto-repeat is
  detected. `ARR=0` is where the responsiveness comes from.

#### Reach and distribution

- **Cross-platform split panes.** `launch` now supports tmux, iTerm2, kitty and
  WezTerm in addition to Windows Terminal, so the game works on macOS and Linux.
  Backend selection lives in `scripts/launch-plan.mjs` as a pure function, which
  makes every backend testable from any machine.
- **`--backend=<name>`** to override auto-detection and **`--dry-run`** to print
  the command without opening anything.
- **Claude Code marketplace.** Install with `/plugin marketplace add
  philppplik/claude-tetris` followed by `/plugin install
  claude-tetris@philppplik-plugins`.
- **Working CLI subcommands.** `claude-tetris launch|install|uninstall`, plus
  `--help` and `--version`.
- CI across Linux, macOS and Windows on Node 18, 20 and 22; a tag-triggered
  publish workflow with npm provenance.

### Fixed

- **Importing `install.mjs` or `uninstall.mjs` edited the user's real
  `~/.claude/settings.json`.** Both called `main()` at module level. They now run
  only when executed directly, guarded by `lib/direct-run.mjs` and a regression
  test.
- **The hold slot never worked properly.** `reset()` and `holdPiece()` wrote to
  `this.old` while the rest of the engine read `this.hold`, so the slot was never
  rendered and a second hold discarded the held piece instead of swapping it back.
- **`claude-tetris launch` did nothing.** Every documented subcommand was ignored
  and silently started the game instead, because `bin/tetris.mjs` never read
  `process.argv`.
- Hook commands used a `<plugin_dir>` placeholder that nothing substituted; they
  now use `${CLAUDE_PLUGIN_ROOT}`.
- `install.mjs` no longer writes an `enabledPlugins` entry for a marketplace that
  did not exist.
- Install tests seeded their fixture from the user's real `~/.claude/settings.json`
  and failed on any machine that did not happen to have `rune-kit` installed.

### Removed

- The `web/` showcase site and its `npm run dev` server. It shipped a second,
  separate Tetris implementation that had to be kept in sync by hand and was
  never part of the published package.

### Changed

- Line endings are pinned by `.gitattributes` instead of each contributor's
  `core.autocrlf`.
- Documentation no longer hardcodes a test count.

## [0.1.0] - 2026-07-13

### Added

- Initial release: headless Tetris engine with SRS rotation and wall kicks, a
  7-bag randomizer, ghost piece, hold, hard and soft drop.
- Terminal UI with ANSI rendering, raw keyboard input and resize handling.
- Auto-pause coupling to Claude Code via `UserPromptSubmit` and `Stop` hooks over
  an atomically written signal file.
- Windows Terminal split-pane launcher and a `/tetris` slash command.

[Unreleased]: https://github.com/philppplik/claude-tetris/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/philppplik/claude-tetris/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/philppplik/claude-tetris/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/philppplik/claude-tetris/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/philppplik/claude-tetris/releases/tag/v0.1.0

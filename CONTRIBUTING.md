## Contributing to claude-tetris

PRs are very welcome. The game engine is fully headless and unit-tested, so most
features can be added without touching the terminal UI.

### Quick start

```bash
git clone https://github.com/philppplik/claude-tetris.git
cd claude-tetris
npm test        # 44 tests, ~1s — make sure they stay green
npm run dev     # preview the showcase site at http://localhost:8137
```

### Layout

- `game/core.mjs` — engine (no I/O, fully tested). **Add game logic here.**
- `game/tui.mjs` — terminal rendering + input. Keep it thin.
- `lib/signal.mjs` — the hook ↔ TUI signal channel.
- `tests/` — `node --test`. Add a test per behaviour you change.

### Before opening a PR

1. `npm test` is green.
2. No new `console.log` left in production paths.
3. Update `README.md` if you change the CLI or controls.

### Releasing

Maintainers: tag a release and let CI publish.

```bash
npm version patch        # or minor / major
git push --follow-tags
# the "publish" workflow builds, tests, and publishes to npm
```

Built with [Hermes Agent](https://hermes-agent.nousresearch.com) 🤖 and
[Claude](https://claude.ai) ✨.

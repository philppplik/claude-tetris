# Contributing to claude-tetris

PRs are very welcome. The game engine is fully headless and unit-tested, so most
features can be added without touching the terminal UI.

## Quick start

```bash
git clone https://github.com/philppplik/claude-tetris.git
cd claude-tetris
npm test          # nothing to install - it's all node --test
npm start         # play it
```

There are no dependencies, no build step and no test framework. Node 18 or newer
is the only requirement.

## Layout

- `game/core.mjs` — engine (no I/O, fully tested). **Add game logic here.**
- `game/tui.mjs` — terminal rendering and input. Keep it thin.
- `lib/signal.mjs` — the hook to TUI signal channel.
- `scripts/launch-plan.mjs` — pure terminal-backend selection.
- `scripts/launch.mjs` — executes the plan. Keep decisions out of it.
- `.claude-plugin/`, `hooks/`, `commands/` — the Claude Code plugin.
- `tests/` — `node --test`. One test per behaviour you change.

## Conventions

- **ES modules**, Node >= 18, no runtime dependencies. Please keep it that way.
- **Keep logic out of I/O.** Anything that makes a decision belongs in a pure
  function a test can call directly. `launch-plan.mjs` is the pattern: it takes
  `platform`, `env` and `has()` as arguments, so every terminal backend is
  testable on every machine.
- **No machine-dependent tests.** Never seed a fixture from the user's real
  `~/.claude/settings.json`, and never assume a particular terminal is installed.
  Build synthetic fixtures instead.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/):
  `fix(core): ...`, `feat(launch): ...`, `docs: ...`, `chore(ci): ...`.
  Explain *why* in the body; the diff already shows the *what*.

## Running a subset

```bash
node --test tests/core.test.mjs
node --test tests/launch.test.mjs
```

## Before opening a PR

1. `npm test` is green.
2. A test covers the behaviour you changed.
3. `README.md` is updated if you touched the CLI, controls or install steps.
4. `CHANGELOG.md` has an entry under `## [Unreleased]`.

CI runs the suite on Linux, macOS and Windows against Node 18, 20 and 22, checks
that the npm tarball still contains everything the plugin needs at runtime, and
validates the plugin manifests with `claude plugin validate`.

## Releasing

Maintainers only. The version lives in three places and a test enforces that they
agree: `package.json`, `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`.

```bash
# 1. Move the Unreleased section of CHANGELOG.md under the new version.
# 2. Bump all three manifests to the same version.
# 3. Confirm the version-drift test passes.
npm test

# 4. Tag and push. The publish workflow re-runs the tests, verifies the tag
#    matches package.json, and publishes to npm with provenance.
git tag v0.3.0
git push --follow-tags
```

The publish workflow needs an `NPM_TOKEN` repository secret with publish rights
(use an automation token, so it works without a 2FA prompt).

---

Built with [Hermes Agent](https://hermes-agent.nousresearch.com) and
[Claude](https://claude.ai).

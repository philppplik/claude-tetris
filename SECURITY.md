# Security Policy

## Supported versions

Only the latest published version receives fixes.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | yes       |
| < 0.2   | no        |

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/philppplik/claude-tetris/security/advisories/new)
rather than opening a public issue.

You can expect an initial response within 7 days.

## What this package touches

Worth knowing when assessing impact:

- **It edits `~/.claude/settings.json`.** `claude-tetris install` merges two hook
  entries into that file. It always writes a timestamped backup first and never
  removes hooks it did not add.
- **It installs Claude Code hooks, which run shell commands.** The two hooks only
  invoke `node scripts/tetris-signal.mjs play|pause`.
- **It writes a signal file** under `~/.claude-tetris/` (override with
  `CLAUDE_TETRIS_DIR`). Writes are atomic via temp file plus rename; reads are
  tolerant of partial or corrupt content.
- **It spawns a terminal process** when you run `launch`, using `shell: false`
  and an explicit argument vector, so paths are never re-parsed by a shell.
- **It has no runtime dependencies** and makes no network requests.

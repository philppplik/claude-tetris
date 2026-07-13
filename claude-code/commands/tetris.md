---
description: Launch claude-tetris in a new terminal pane (playable while Claude works)
---

Launch the **claude-tetris** game in a new Windows Terminal pane so it runs alongside
Claude Code. The game auto-pauses when Claude finishes and resumes on your next prompt
(via the installed hooks).

Open a split pane and start the game. Prefer the global CLI if installed:

```bash
claude-tetris launch
```

If the global CLI is not on PATH (e.g. running from a local clone), fall back to:

```bash
node "<plugin_dir>/scripts/launch.mjs"
```

Tell the user the game is now running and remind them of the controls:
`←→` move · `↑`/`X` rotate · `↓` soft drop · `Space` hard drop · `C` hold · `P` pause · `Q` quit.
Press **F11** in the game pane for fullscreen (recommended).

# claude-tetris — Website

Marketing/showcase site for the `claude-tetris` plugin. Built as static
HTML/CSS/JS — no build step, no framework.

## Structure

```
web/
├── index.html          # all sections
├── assets/
│   ├── style.css        # Claude-style design system + scroll animationen
│   ├── tetris-demo.js   # self-contained, playable canvas Tetris (hero + demo)
│   └── main.js          # scroll-reveal, sticky nav, copy buttons
└── verify.cjs           # headless logic smoke-test (node verify.cjs)
```

## Design language

- **Claude / Anthropic aesthetic**: warm off-white (`#fbf9f4`), caramel-orange
  accent (`#d97757`), Fraunces serif headlines, Inter body, generous whitespace.
- **Tetris rainbow** for play elements (the canvas blocks keep their classic colors).
- **Scroll-guided**: IntersectionObserver reveals, sticky blurred nav, floating
  blocks in the hero, micro-interactions on hover.

## Sections

1. Sticky nav (blur on scroll)
2. Hero — headline + **live interactive Tetris canvas** + CTAs
3. How it works — 3 steps + signal-flow diagram
4. Features — bento grid (SRS, 7-bag, ghost, hooks, split-pane, responsive)
5. Live demo — full canvas game with HUD + game-over overlay
6. Install — easy (`.bat`) + command-line + `/tetris` slash command
7. Footer

## Run locally

```bash
cd web
python3 -m http.server 8137
# open http://localhost:8137
```

## Notes

- The hero canvas runs in "ambient" mode (auto-plays, ignores keys).
- The demo canvas is fully playable: ← → move, ↑/X rotate, ↓ soft, Space hard,
  C hold, P pause. Game over shows an overlay with a "Play again" button.
- `prefers-reduced-motion` is respected (reveals + floats disabled).

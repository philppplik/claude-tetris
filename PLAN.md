# claude-tetris — Projektplan

> Spiele Tetris, während Claude Code "am cooken" ist. Sobald Claude fertig
> generiert, pausiert das Spiel automatisch — und läuft weiter, sobald Claude
> wieder arbeitet.

Stand: Recherche abgeschlossen, Architektur festgelegt. **Noch kein Code.**

---

## 1. Die Kernidee

Während Claude Code eine Antwort generiert (der "Cook"), wartet der User oft
Sekunden bis Minuten. Diese Wartezeit füllen wir mit einem spielbaren Tetris.
Der Zustand des Spiels ist an Claudes Arbeitszustand gekoppelt:

| Claude-Zustand        | Tetris-Zustand |
|-----------------------|----------------|
| generiert / arbeitet  | ▶️ läuft (spielbar) |
| fertig / wartet auf Input | ⏸️ pausiert |
| braucht Erlaubnis (Permission-Prompt) | ⏸️ pausiert (optional) |

---

## 2. Die zentrale technische Erkenntnis (aus der Doku-Recherche)

**Ein spielbares Tetris kann NICHT direkt in Claude Codes eigenem Fenster
laufen.** Belege aus den offiziellen Docs:

- **Hooks haben kein Terminal.** Zitat Hooks-Reference: Hook-Prozesse
  *"can't open /dev/tty or send escape sequences directly to the Claude Code
  interface"*. Ein Hook ist ein kurzlebiges Shell-Kommando, das ein Event
  meldet — er kann nichts zeichnen und keine Tasten empfangen.
- **Die Statusline ist reine Ausgabe.** Sie rendert Text-Zeilen unten im
  Fenster, aktualisiert aber nur nach jeder Assistant-Message bzw. per Timer
  (min. 1 s = 1 fps) und **empfängt keine Tastatureingaben**. Damit ginge nur
  ein "Ghost-Tetris" das sich selbst spielt — nicht mitspielbar.
- **Claude Code besitzt Terminal + Tastatur exklusiv,** während es läuft.
  Tastenanschläge gehen an Claude Codes Message-Queue, nicht an ein Spiel.

**Konsequenz:** Das Tetris braucht eine **eigene Fläche**. Wir wählen die
Fläche, die sich am meisten wie "neben Claude, im selben Fenster" anfühlt:

### Gewählter Weg: Split-Pane im Windows Terminal

Ein Fenster, zwei Panes:

```
┌──────────────────────────────┬──────────────────┐
│                              │                  │
│   Claude Code                │   🎮 TETRIS      │
│   (linke Pane)               │   (rechte Pane)  │
│                              │                  │
│   > baue mir eine API...     │   [Spielfeld]    │
│   ⏺ cooking...               │   Score: 1200    │
│                              │   ▶ PLAYING      │
└──────────────────────────────┴──────────────────┘
```

- **Linke Pane:** ganz normales Claude Code.
- **Rechte Pane:** ein dauerhaft laufender Node-Prozess = das Tetris-TUI.
- Jede Pane hat ihre **eigene Tastatur** → in der rechten Pane spielst du echt.
- Die **Hooks** in Claude Code schreiben Play/Pause-Signale, die das Tetris
  liest → automatische Kopplung.

---

## 3. Architektur (3 Bausteine)

### Baustein A — Das Tetris-TUI (`game/`)
- Node.js, läuft dauerhaft in der rechten Pane.
- Rendert mit ANSI-Escape-Codes (Farben, Blöcke via Unicode `█`).
- Voller Tetris-Loop: 7 Tetrominoes, Rotation (SRS-Light), Line-Clears,
  Level/Speed, Score, Next-Piece, Hold, Game-Over + Restart.
- Liest Tastatur im Raw-Mode (Pfeiltasten, Space=Hard-Drop, C=Hold, P=Pause,
  Q=Quit).
- **Watcht den Signal-Kanal** (Baustein B): bei `PAUSE` friert das Spiel ein
  und zeigt "⏸ Claude ist fertig — warte auf nächsten Prompt". Bei `PLAY`
  läuft es weiter.
- Ästhetik: minimalistisch, dunkel, Akzentfarbe (Violett passend zu deinem
  Gogure-/Vercel-Stil). "$10k-Terminal-Look" soweit ANSI es zulässt.

### Baustein B — Der Signal-Kanal
- **State-Datei** (robusteste Variante auf Windows, keine Sockets/Named-Pipes
  nötig): eine Datei z.B. `~/.claude-tetris/state.json` mit `{"state":"PLAY",
  "ts":..., "reason":"..."}`.
- Hooks **schreiben** die Datei (ein Zeilen-Befehl).
- Das Tetris **pollt** sie alle ~100 ms (billig, absolut robust).
- Optional später: File-Watcher statt Polling für sofortige Reaktion.

### Baustein C — Das Claude-Code-Plugin (`plugin/`)
Verpackt die Hooks als installierbares Plugin — genau dein "Plug-in"-Wunsch.
Struktur laut Plugins-Reference:

```
plugin/
├── .claude-plugin/
│   └── plugin.json          # Name, Version, Beschreibung
├── hooks/
│   └── hooks.json           # Event → Signal-Mapping
└── scripts/
    ├── signal-play.mjs       # schreibt state=PLAY
    └── signal-pause.mjs      # schreibt state=PAUSE
```

Hook-Mapping:

| Hook-Event         | Wann                              | Aktion         |
|--------------------|-----------------------------------|----------------|
| `SessionStart`     | Session startet                   | init state     |
| `UserPromptSubmit` | User schickt Prompt → Cook beginnt| → **PLAY**     |
| `Stop`             | Claude ist fertig                 | → **PAUSE**    |
| `Notification` (permission) | Claude braucht Erlaubnis | → PAUSE (opt.) |

Hook-Handler = winzige Node-Scripts (`node` ist da, `.mjs` läuft cross-platform;
`.cmd`-Shim-Problem auf Windows umgehen wir mit direktem `node script.mjs`).

### Baustein D — Der Launcher (`bin/`)
Ein Befehl `claude-tetris`, der das Split-Fenster aufbaut:
```
wt.exe claude \; split-pane -V --size 0.35 node <pfad>/game/tetris.mjs
```
Öffnet Windows Terminal mit Claude links und Tetris rechts. Alternativ ein
`.cmd`- oder `.ps1`-Wrapper. Wenn der User Claude schon offen hat, kann er die
Tetris-Pane auch manuell per `wt split-pane` dazuholen.

---

## 4. Datenfluss (End-to-End)

```
1. User startet:  claude-tetris
                  → WT öffnet: [Claude | Tetris]
                  → Tetris steht auf PAUSE (Claude wartet noch auf Prompt)

2. User tippt Prompt in Claude, Enter
                  → Hook UserPromptSubmit feuert
                  → scripts/signal-play.mjs schreibt state=PLAY
                  → Tetris (pollt) sieht PLAY → Spiel läuft ▶️
                  → User spielt, während Claude cookt

3. Claude fertig mit Antwort
                  → Hook Stop feuert
                  → scripts/signal-pause.mjs schreibt state=PAUSE
                  → Tetris sieht PAUSE → Spiel friert ein ⏸️
                  → Score bleibt erhalten

4. User tippt nächsten Prompt → zurück zu Schritt 2 (Spiel läuft weiter)
```

---

## 5. Tech-Stack (final)

| Komponente     | Wahl                    | Begründung |
|----------------|-------------------------|------------|
| Sprache        | Node.js (v24 vorhanden) | Gleiche Welt wie Claude Code; kein Python-`curses`-Drama auf Windows; cross-platform |
| TUI-Rendering  | Raw ANSI (ggf. leichte Lib) | Volle Kontrolle, keine schweren Deps; portabel |
| Signal-Kanal   | State-JSON-Datei + Polling | Robusteste Variante auf Windows |
| Terminal-Split | Windows Terminal `wt.exe` | Nativ vorhanden, echte Panes, je eigene Tastatur |
| Plugin-Format  | Claude Code Plugin (hooks.json) | Standard-Weg, per Marketplace teilbar |

---

## 6. Bau-Phasen (Reihenfolge)

- [ ] **Phase 0 — Setup:** Projektstruktur anlegen, `package.json`, Signal-Modul
      (schreiben + lesen der state.json) isoliert testen.
- [ ] **Phase 1 — Tetris-Core (headless):** Spiellogik ohne Rendering
      (Board, Tetrominoes, Rotation, Line-Clear, Scoring) + Unit-Tests. Läuft
      ohne Terminal, verifizierbar.
- [ ] **Phase 2 — Tetris-TUI:** ANSI-Rendering + Raw-Keyboard + Game-Loop.
      Standalone spielbar machen (`node game/tetris.mjs`), von Hand testen.
- [ ] **Phase 3 — Pause-Kopplung:** Tetris pollt state.json, reagiert auf
      PLAY/PAUSE. Manuell testen (state.json von Hand umschalten).
- [ ] **Phase 4 — Plugin + Hooks:** plugin.json, hooks.json, signal-Scripts.
      In Claude Code installieren, echten Prompt schicken, prüfen ob Play/Pause
      automatisch schaltet.
- [ ] **Phase 5 — Launcher:** `claude-tetris`-Befehl der die Split-Pane baut.
- [ ] **Phase 6 — Politur:** Farben/Look, Highscore-Persistenz, Optionen
      (Pause-bei-Permission an/aus), README + Install-Anleitung.
- [ ] **Phase 7 — Verteilung:** Als Marketplace-Plugin verpacken, damit es
      andere per Befehl installieren können. Optional: auch als Hermes-Skill
      spiegeln (deine Konvention: neue Tools in Claude Code UND Hermes).

---

## 7. Offene Punkte / spätere Entscheidungen

- **Pause bei Permission-Prompts?** Wenn Claude eine Bestätigung braucht, soll
  das Spiel pausieren (damit du reagieren kannst) — an/aus konfigurierbar.
- **Poll-Intervall vs. File-Watcher:** Start mit Polling (100 ms), bei Bedarf
  auf Watcher umstellen.
- **Look-Feintuning:** Farbschema, Fonts sind terminalseitig begrenzt — wir
  holen das Maximum an Ästhetik raus, das ANSI/Unicode zulässt.
- **Fallback ohne Windows Terminal:** separates Fenster als Plan B (später).

---

## 8. Referenz-Recherche (abgelegt in `research/`)

- `hooks.txt` — vollständige Claude-Code Hooks-Reference (Events, Lifecycle,
  Ein-/Ausgabe, plugin hooks)
- `statusline.txt` — Statusline-Doku (belegt: nur Ausgabe, kein Input)
- `plugins.txt` / `plugins-ref.txt` — Plugin-Aufbau, plugin.json, hooks.json,
  Marketplace-Struktur

Kernbelege: UserPromptSubmit + Stop sind die exakt passenden Signale; Hooks
laufen ohne TTY (→ eigene Fläche nötig); Plugins bündeln Hooks + Scripts +
sind per Marketplace teilbar.

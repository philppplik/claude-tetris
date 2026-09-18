// lib/direct-run.mjs — Wurde dieses Modul direkt gestartet oder nur importiert?
//
// Skripte, die etwas am System verändern, dürfen beim bloßen Import NICHTS tun.
// Ohne diese Unterscheidung schreibt schon `import "./install.mjs"` in die
// settings.json des Users — ein Test, der nur eine Konstante lesen wollte,
// installiert dann versehentlich Hooks.

import path from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} moduleUrl  immer `import.meta.url` des aufrufenden Moduls */
export function isDirectRun(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

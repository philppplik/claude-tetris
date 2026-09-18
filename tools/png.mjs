// tools/png.mjs — Minimaler PNG-Encoder (Truecolor, 8 bit, kein Alpha).
//
// Nur für tools/record-demo.mjs. Node bringt zlib mit, mehr braucht ein
// PNG nicht — so bleibt das Paket bei null Laufzeit-Abhängigkeiten.

import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Eine einfache Zeichenfläche: RGB-Bytes plus ein paar Primitive. */
export class Canvas {
  constructor(width, height, background = [0, 0, 0]) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 3);
    this.fill(0, 0, width, height, background);
  }

  fill(x, y, w, h, [r, g, b]) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.width, (x + w) | 0);
    const y1 = Math.min(this.height, (y + h) | 0);
    for (let py = y0; py < y1; py++) {
      let i = (py * this.width + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.data[i++] = r;
        this.data[i++] = g;
        this.data[i++] = b;
      }
    }
  }

  /** Blendet einen Bereich gleichmäßig ab (0 = unverändert, 1 = ganz weg). */
  dim(x, y, w, h, amount, [tr, tg, tb] = [0, 0, 0]) {
    const a = Math.min(1, Math.max(0, amount));
    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      let i = (py * this.width + x) * 3;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) { i += 3; continue; }
        this.data[i] = this.data[i] + (tr - this.data[i]) * a;
        this.data[i + 1] = this.data[i + 1] + (tg - this.data[i + 1]) * a;
        this.data[i + 2] = this.data[i + 2] + (tb - this.data[i + 2]) * a;
        i += 3;
      }
    }
  }

  /** Rechteck-Umriss. */
  stroke(x, y, w, h, color, t = 1) {
    this.fill(x, y, w, t, color);
    this.fill(x, y + h - t, w, t, color);
    this.fill(x, y, t, h, color);
    this.fill(x + w - t, y, t, h, color);
  }
}

/** 3x5-Ziffern. Zahlen müssen wir selbst zeichnen; Labels macht ffmpeg. */
const DIGITS = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "001", "001", "001"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
};

/** Zeichnet eine Zahl. scale = Pixel pro Font-Pixel. Gibt die Breite zurück. */
export function drawNumber(canvas, value, x, y, color, scale = 3) {
  const text = String(value);
  let cx = x;
  for (const ch of text) {
    const glyph = DIGITS[ch];
    if (glyph) {
      glyph.forEach((row, ry) => {
        [...row].forEach((on, rx) => {
          if (on === "1") {
            canvas.fill(cx + rx * scale, y + ry * scale, scale, scale, color);
          }
        });
      });
    }
    cx += 4 * scale; // 3 breit + 1 Abstand
  }
  return cx - x;
}

/** Kodiert die Zeichenfläche als PNG-Buffer. */
export function encodePNG(canvas) {
  const { width, height, data } = canvas;

  // Scanlines mit Filter-Byte 0 (none) davor.
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const src = y * width * 3;
    const dst = y * (width * 3 + 1);
    raw[dst] = 0;
    data.copy(raw, dst + 1, src, src + width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolor
  // 10..12 = compression, filter, interlace = 0

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, payload) {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, "ascii");
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

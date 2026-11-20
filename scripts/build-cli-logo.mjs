// Builds the bees CLI banner from assets/logo.svg as true-color pixel art.
//
//   npm i --no-save @resvg/resvg-js
//   node scripts/build-cli-logo.mjs
//
// Writes (committed, so the CLI needs no image libraries at runtime):
//   assets/cli-banner.ansi        full banner: pixel robot bee + "bees" wordmark + tagline
//   assets/cli-banner-plain.txt   wordmark only, for NO_COLOR / --no-color
//   assets/cli-banner-preview.png how the banner looks in a dark terminal (for docs)
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const asset = (name) => new URL(`../assets/${name}`, import.meta.url);
const BEE_COLS = 30; // banner is BEE_COLS wide, ~17 rows tall
const GAP = 4;
const HONEY = [255, 195, 0];
const TEXT = [230, 237, 243];
const DIM = [139, 148, 158];

// 1. Rasterize the logo without its honeycomb badge, cropped to the bee.
const svg = readFileSync(asset("logo.svg"), "utf8")
  .replace(/<!-- honeycomb badge -->[\s\S]*?<\/g>/, "")
  .replace('viewBox="0 0 512 512" width="512" height="512"', 'viewBox="58 36 396 436"');
const { width: w, height: h, pixels } = new Resvg(svg, { fitTo: { mode: "width", value: BEE_COLS } }).render();
const px = (x, y) => {
  if (y >= h) return null;
  const i = (y * w + x) * 4;
  return pixels[i + 3] < 128 ? null : [pixels[i], pixels[i + 1], pixels[i + 2]];
};

// 2. Wordmark "bees" in a 4x6 pixel font, drawn at 2x with full blocks.
const FONT = {
  b: ["#...", "#...", "###.", "#..#", "#..#", "###."],
  e: ["....", ".##.", "#..#", "####", "#...", ".###"],
  s: ["....", ".###", "#...", ".##.", "...#", "###."],
};
const wordmark = FONT.b.map((_, row) =>
  [..."bees"].map((ch) => FONT[ch][row].replace(/#/g, "██").replace(/\./g, "  ")).join("  "),
);

// 3. Compose: bee on the left; wordmark, tagline and subtitle on the right.
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const bg = ([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`;
const RESET = "\x1b[0m";
const rows = Math.ceil(h / 2);
const top = Math.max(0, Math.floor((rows - 10) / 2));
const right = Array(rows).fill(null);
wordmark.forEach((line, i) => (right[top + i] = [HONEY, line]));
right[top + 7] = [TEXT, "One hive, every agent."];
right[top + 9] = [DIM, "Claude Code · Copilot · Cursor · Codex"];

const ansi = [];
const preview = []; // [x, y, w, h, color] in half-cell units for the PNG
for (let r = 0; r < rows; r++) {
  let line = "";
  for (let x = 0; x < w; x++) {
    const t = px(x, 2 * r), b = px(x, 2 * r + 1);
    if (t) preview.push([x, 2 * r, t]);
    if (b) preview.push([x, 2 * r + 1, b]);
    if (!t && !b) line += RESET + " ";
    else if (t && !b) line += RESET + fg(t) + "▀";
    else if (!t && b) line += RESET + fg(b) + "▄";
    else line += fg(t) + bg(b) + "▀";
  }
  if (right[r]) line += RESET + " ".repeat(GAP) + fg(right[r][0]) + right[r][1];
  ansi.push(line.replace(/(\x1b\[0m )+$/, "") + RESET);
}
writeFileSync(asset("cli-banner.ansi"), ansi.join("\n") + "\n");
writeFileSync(asset("cli-banner-plain.txt"), wordmark.map((l) => l.trimEnd()).join("\n") + "\n");

// 4. Preview PNG: terminal cell = 10x20 px, so one logo pixel = 10x10.
const C = 10, PAD = 30;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
const cells = preview.map(([x, y, c]) => `<rect x="${x * C}" y="${y * C}" width="${C}" height="${C}" fill="${rgb(c)}"/>`).join("");
const texts = right.map((v, r) => {
  if (!v) return "";
  const [color, s] = v;
  const x = (w + GAP) * C;
  if (s.includes("█")) {
    return [...s].map((ch, i) => (ch === "█" ? `<rect x="${x + i * C}" y="${r * 2 * C}" width="${C}" height="${2 * C}" fill="${rgb(color)}"/>` : "")).join("");
  }
  return `<text x="${x}" y="${r * 2 * C + 15}" font-family="Cascadia Mono, Consolas, Menlo, monospace" font-size="16" fill="${rgb(color)}">${esc(s)}</text>`;
}).join("");
const W = (w + GAP + 46) * C + PAD * 2, H = rows * 2 * C + PAD * 2;
const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" rx="12" fill="#0D1117"/><g transform="translate(${PAD} ${PAD})">${cells}${texts}</g></svg>`;
writeFileSync(asset("cli-banner-preview.png"), new Resvg(page).render().asPng());

process.stdout.write(ansi.join("\n") + "\n");

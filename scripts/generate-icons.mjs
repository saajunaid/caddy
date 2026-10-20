// Generates the PWA icons in public/icons from one SVG design.
// Run with: pnpm icons
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BG = "#282A36";
const PURPLE = "#BD93F9";
const GREEN = "#50FA7B";

/**
 * A "C" drawn as a thick arc with a green dot in its opening: something new for the household.
 * `inset` shrinks the glyph so maskable icons keep it inside the 80% safe zone.
 */
function svg({ size, inset = 0, rounded = true }) {
  const s = 512;
  const scale = 1 - inset;
  const r = 150 * scale;
  const stroke = 74 * scale;
  const cx = s / 2;
  const cy = s / 2;
  const start = (40 * Math.PI) / 180;
  const end = (320 * Math.PI) / 180;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy - r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy - r * Math.sin(end);
  const dot = 34 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="${BG}"/>
  <path d="M ${x1} ${y1} A ${r} ${r} 0 1 0 ${x2} ${y2}" fill="none" stroke="${PURPLE}" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="${cx + r + 6 * scale}" cy="${cy}" r="${dot}" fill="${GREEN}"/>
</svg>`;
}

const outputs = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, inset: 0.2, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: false },
];

await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/icon.svg", svg({ size: 512 }));
for (const { file, size, inset, rounded } of outputs) {
  await sharp(Buffer.from(svg({ size, inset, rounded })))
    .png()
    .toFile(`public/icons/${file}`);
  console.log(`public/icons/${file}`);
}

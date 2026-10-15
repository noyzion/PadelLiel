/**
 * Generates the PWA / notification icons in public/icons from the supplied emblem (public/brand/tennis-centers-logo.png).
 * The emblem is only cropped to a circle and placed on the brand navy - it is never redrawn or recoloured
 * (same treatment as <VenueLogo />). Run once: `node scripts/generate-pwa-icons.mjs` (the PNGs are committed).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOGO = path.join(ROOT, 'public', 'brand', 'tennis-centers-logo.png');
const OUT = path.join(ROOT, 'public', 'icons');
const NAVY = '#012653';

fs.mkdirSync(OUT, { recursive: true });

/** The emblem cropped to a circle of `diameter` px. */
async function roundLogo(diameter) {
  const mask = Buffer.from(`<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`);
  return sharp(LOGO)
    .resize(diameter, diameter, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Navy square with the circular emblem; `ratio` = share of the side the emblem occupies. */
async function icon(size, ratio, file) {
  const d = Math.round(size * ratio);
  const logo = await roundLogo(d);
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: logo, left: Math.round((size - d) / 2), top: Math.round((size - d) / 2) }])
    .png()
    .toFile(path.join(OUT, file));
}

await icon(192, 0.84, 'icon-192.png');
await icon(512, 0.84, 'icon-512.png');
// Maskable: all important content inside the central 80% safe zone.
await icon(512, 0.62, 'icon-maskable-512.png');
// iOS home-screen icon: opaque, iOS applies its own corner rounding.
await icon(180, 0.84, 'apple-touch-icon.png');

// Notification badge (Android uses only the alpha channel): a simple white bell on transparent.
const bell = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
     <path d="M10.268 21a2 2 0 0 0 3.464 0"/>
     <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>
   </svg>`,
);
await sharp(bell).png().toFile(path.join(OUT, 'badge-96.png'));

console.log('Icons written to', OUT);

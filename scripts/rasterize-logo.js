/**
 * Rasterizes the KVS emblem SVG to the PNG the app actually ships.
 *
 *   assets/kvsLogo 1.svg  ->  assets/kvs-logo.png   (1024x1024, transparent corners)
 *
 * Why a PNG at all, when the source is vector:
 *  - `expo-splash-screen` only accepts a raster image for the native splash.
 *  - `react-native-svg` is not installed, so RN cannot render the SVG directly.
 *    Adding it would mean another native rebuild for one image.
 * One 1024px PNG covers every density the logo is drawn at (180dp splash,
 * 104dp login), so the vector buys nothing here.
 *
 * The output keeps the SVG's white disc — the emblem's maroon text is
 * unreadable directly on the indigo brand background, so the disc is what makes
 * it legible. Corners stay transparent so it reads as a badge, not a square.
 *
 * The rasterizer is NOT a project dependency: it is needed only when the logo
 * changes, and the app bundle has no use for it. Install it for the one run:
 *
 *   npm install --no-save --legacy-peer-deps @resvg/resvg-js
 *   node scripts/rasterize-logo.js
 *
 * (`--legacy-peer-deps` because this project pins several @babel/*@8 plugins
 * against @babel/core@7, which makes npm reject any install without it.)
 */
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const SRC = path.join(__dirname, '..', 'assets', 'kvsLogo 1.svg');
const OUT = path.join(__dirname, '..', 'assets', 'kvs-logo.png');

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  console.error(
    '@resvg/resvg-js is not installed.\n' +
      'Run:  npm install --no-save --legacy-peer-deps @resvg/resvg-js',
  );
  process.exit(1);
}

const svg = fs.readFileSync(SRC, 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: SIZE },
  background: 'rgba(0,0,0,0)',
})
  .render()
  .asPng();

fs.writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(0)} KB)`);

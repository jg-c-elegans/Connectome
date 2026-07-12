/**
 * Accept an SVG that embeds a PNG (Affinity/Serif export style:
 *   <image xlink:href="data:image/png;base64,..."/>)
 * Extract the PNG and emit a monochrome path SVG for the codicon font builder.
 *
 * Why this exists: icon fonts need vector <path> glyphs. A .svg file that only
 * wraps a raster is not a vector glyph — but we still treat the user's file as
 * the source of truth and extract artwork from it rather than a separate PNG.
 *
 * Usage:
 *   node scripts/svg-embedded-png-to-path.js <input.svg> <output.svg>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
    console.error('Usage: node scripts/svg-embedded-png-to-path.js <input.svg> <output.svg>');
    process.exit(1);
}

const svg = fs.readFileSync(input, 'utf8');

// Prefer real path data if the SVG already has it.
const pathMatch = svg.match(/<path\b[^>]*\sd="([^"]+)"/i);
if (pathMatch && !/<image\b/i.test(svg)) {
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <path fill="#000" d="${pathMatch[1]}"/>
</svg>
`;
    fs.writeFileSync(output, out, 'utf8');
    console.log('Copied existing <path> from', input);
    process.exit(0);
}

const dataUrl = svg.match(/(?:xlink:)?href="(data:image\/png;base64,[^"]+)"/i);
if (!dataUrl) {
    console.error(
        'No vector <path> and no embedded PNG data URL found in',
        input,
        '\nCodicon fonts need monochrome path SVGs. Re-export as paths, or embed a PNG we can trace.'
    );
    process.exit(1);
}

const b64 = dataUrl[1].replace(/^data:image\/png;base64,/, '');
const tmpPng = path.join(os.tmpdir(), `connectome-codicon-${Date.now()}.png`);
fs.writeFileSync(tmpPng, Buffer.from(b64, 'base64'));
console.log('Extracted embedded PNG from', path.resolve(input), `(${fs.statSync(tmpPng).size} bytes)`);

const tracer = path.join(__dirname, 'png-to-codicon-svg.js');
const result = spawnSync(process.execPath, [tracer, tmpPng, output], { stdio: 'inherit' });
try { fs.unlinkSync(tmpPng); } catch { /* ignore */ }
process.exit(result.status === null ? 1 : result.status);

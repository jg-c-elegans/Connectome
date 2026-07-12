/**
 * Build Connectome custom codicons (icon font) from SVGs.
 *
 * Same approach as microsoft/vscode-codicons: monochrome SVGs → SVG font →
 * TTF that Theia's activity rail can render via the standard
 * `codicon codicon-<name>` class pattern.
 *
 * Why not SVG / CSS mask? Custom mask-image icons never show on Theia side
 * tab bars (see shared-memory: Memory Inspector, Claude/Codex attempts).
 * Extending the codicon font with a unicode-range face works.
 *
 * Implementation note: we use svgicons2svgfont + svg2ttf directly rather
 * than the fantasticon CLI/API, because fantasticon 3.x is picky about the
 * hoisted `glob` major and fails to find SVGs on Windows in this monorepo.
 *
 * Usage:
 *   yarn build:codicons
 *
 * To add an icon:
 *   1. Drop a monochrome filled SVG into
 *      connectome-extensions/product/src/browser/icons/codicons-src/<name>.svg
 *   2. Add <name> → codepoint in CODEPOINTS below (Private Use Area F000+)
 *   3. yarn build:codicons  (rewrites TTF + connectome-codicons.css)
 *   4. Use codicon('<name>') in TypeScript
 */

'use strict';

const fs = require('fs');
const path = require('path');
const SVGIcons2SVGFontStream = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');

const ROOT = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(
    ROOT,
    'connectome-extensions',
    'product',
    'src',
    'browser',
    'icons',
    'codicons-src'
);
const OUTPUT_DIR = path.join(
    ROOT,
    'connectome-extensions',
    'product',
    'src',
    'browser',
    'icons'
);
const CSS_PATH = path.join(
    ROOT,
    'connectome-extensions',
    'product',
    'src',
    'browser',
    'style',
    'connectome-codicons.css'
);
const FONT_NAME = 'connectome-codicon';
const TTF_PATH = path.join(OUTPUT_DIR, `${FONT_NAME}.ttf`);

/**
 * Stable codepoints in the Private Use Area, above stock @vscode/codicons
 * (which currently tops out around U+EC81). Do not renumber existing entries.
 *
 * Aliases share a codepoint (same glyph, multiple CSS class names). Only
 * names that match an SVG basename are written into the font; pure aliases
 * are CSS-only.
 */
const CODEPOINTS = {
    // Anthropic / Claude Code starburst (codicons-src/claude.svg)
    claude: 0xF000,
    anthropic: 0xF000,
    // Antigravity agent mark (codicons-src/antigravity.svg)
    antigravity: 0xF001,
    agy: 0xF001,
};

async function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.error('Missing input dir:', INPUT_DIR);
        process.exit(1);
    }

    // Only direct glyph sources: <name>.svg. Skip _temps, README, and *.source.svg
    // (raw vendor art kept for reference).
    const svgs = fs
        .readdirSync(INPUT_DIR)
        .filter(f => {
            const lower = f.toLowerCase();
            if (!lower.endsWith('.svg')) return false;
            if (f.startsWith('_')) return false;
            if (lower.endsWith('.source.svg')) return false;
            return true;
        })
        .map(f => path.basename(f, '.svg'))
        .sort();

    if (svgs.length === 0) {
        console.error('No SVGs found in', INPUT_DIR);
        process.exit(1);
    }

    for (const name of svgs) {
        if (!(name in CODEPOINTS)) {
            console.error(
                `SVG "${name}.svg" has no CODEPOINTS entry in scripts/build-connectome-codicons.js`
            );
            process.exit(1);
        }
    }

    console.log('Building connectome codicons from:', INPUT_DIR);
    console.log('  SVGs:', svgs.join(', '));

    const svgFont = await buildSvgFont(svgs);
    const ttf = svg2ttf(svgFont, {
        description: 'Connectome custom codicons',
        url: 'https://github.com/jg-c-elegans/connectome',
        version: '1.0',
    });
    fs.writeFileSync(TTF_PATH, Buffer.from(ttf.buffer));
    writeCss(CODEPOINTS);

    console.log('Wrote', TTF_PATH);
    console.log('Wrote', CSS_PATH);
    console.log('Done. Rebuild product + desktop to pick up the font in the app.');
}

function buildSvgFont(names) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const fontStream = new SVGIcons2SVGFontStream({
            fontName: FONT_NAME,
            fontHeight: 1000,
            normalize: true,
            descent: 0,
            log: () => { /* quiet */ },
        });

        fontStream.on('data', chunk => chunks.push(chunk));
        fontStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        fontStream.on('error', reject);

        // One font glyph per unique codepoint (first SVG name wins for that code).
        const writtenCodes = new Set();
        for (const name of names) {
            const code = CODEPOINTS[name];
            if (writtenCodes.has(code)) {
                continue;
            }
            writtenCodes.add(code);

            const filePath = path.join(INPUT_DIR, `${name}.svg`);
            const glyph = fs.createReadStream(filePath);
            glyph.metadata = {
                unicode: [String.fromCodePoint(code)],
                name,
            };
            fontStream.write(glyph);
        }

        fontStream.end();
    });
}

function writeCss(codepoints) {
    const byCode = new Map();
    for (const [name, code] of Object.entries(codepoints)) {
        if (!byCode.has(code)) {
            byCode.set(code, []);
        }
        byCode.get(code).push(name);
    }

    const glyphRules = [];
    for (const [code, names] of byCode) {
        const hex = code.toString(16);
        const selectors = names.map(n => `.codicon-${n}:before`).join(',\n');
        glyphRules.push(`${selectors} { content: "\\${hex}" }`);
    }

    const css = `/*---------------------------------------------------------------------------------------------
 * Connectome custom codicons - extend the stock @vscode/codicons font.
 *
 * Stock Theia loads font-family "codicon" from @vscode/codicons.
 * We register a second @font-face for the same family name, limited via
 * unicode-range to our Private Use Area (U+F000-F0FF). Browsers use our
 * TTF for those codepoints and the stock font for everything else, so
 * activity-rail icons keep working with the usual:
 *   title.iconClass = codicon('claude')  // -> "codicon codicon-claude"
 *
 * Regenerate with: yarn build:codicons
 * Source SVGs: connectome-extensions/product/src/browser/icons/codicons-src/
 *--------------------------------------------------------------------------------------------*/

@font-face {
    font-family: "codicon";
    font-display: block;
    src: url("../icons/connectome-codicon.ttf") format("truetype");
    unicode-range: U+F000-F0FF;
}

/*---------------------
 * Connectome glyphs
 *-------------------*/

${glyphRules.join('\n\n')}
`;

    fs.writeFileSync(CSS_PATH, css, 'utf8');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

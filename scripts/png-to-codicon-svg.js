/**
 * Convert a monochrome PNG (white glyph on black/transparent) into a single
 * filled SVG path suitable for yarn build:codicons.
 *
 * Pure Node (zlib only) — no sharp/jimp. Uses Moore-neighbor contour tracing
 * on a thresholded bitmap, then Ramer–Douglas–Peucker simplification.
 *
 * Usage:
 *   node scripts/png-to-codicon-svg.js <input.png> <output.svg> [name]
 */
'use strict';

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function readPng(filePath) {
    const buf = fs.readFileSync(filePath);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
        if (buf[i] !== magic[i]) {
            throw new Error(
                `Not a PNG: ${filePath} (got ${[...buf.subarray(0, 8)].map(b => b.toString(16)).join(' ')})`
            );
        }
    }
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 0;
    const idat = [];
    while (offset < buf.length) {
        const len = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        const data = buf.subarray(offset + 8, offset + 8 + len);
        offset += 12 + len;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (!width || !height) {
        throw new Error('Missing IHDR');
    }
    if (bitDepth !== 8) {
        throw new Error('Only 8-bit PNG supported, got bitDepth=' + bitDepth);
    }
    const inflated = zlib.inflateSync(Buffer.concat(idat));
    // channels: 0=gray, 2=RGB, 4=gray+A, 6=RGBA
    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
    if (!channels) {
        throw new Error('Unsupported colorType ' + colorType);
    }
    const stride = width * channels;
    const pixels = new Uint8ClampedArray(width * height); // 1 = glyph, 0 = empty
    let src = 0;
    for (let y = 0; y < height; y++) {
        const filter = inflated[src++];
        const row = inflated.subarray(src, src + stride);
        src += stride;
        // apply filter (only type 0/1/2/3/4 basic)
        const recon = Buffer.alloc(stride);
        for (let i = 0; i < stride; i++) {
            const x = row[i];
            const a = i >= channels ? recon[i - channels] : 0;
            const b = y > 0 ? prev[i] : 0;
            const c = y > 0 && i >= channels ? prev[i - channels] : 0;
            let val = x;
            if (filter === 1) val = (x + a) & 255;
            else if (filter === 2) val = (x + b) & 255;
            else if (filter === 3) val = (x + Math.floor((a + b) / 2)) & 255;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                val = (x + pr) & 255;
            }
            recon[i] = val;
        }
        var prev = recon;
        for (let x = 0; x < width; x++) {
            const i = x * channels;
            let lum;
            let alpha = 255;
            if (channels === 1) {
                lum = recon[i];
            } else if (channels === 2) {
                lum = recon[i];
                alpha = recon[i + 1];
            } else if (channels === 3) {
                lum = (recon[i] + recon[i + 1] + recon[i + 2]) / 3;
            } else {
                lum = (recon[i] + recon[i + 1] + recon[i + 2]) / 3;
                alpha = recon[i + 3];
            }
            // White (or any bright) opaque pixel = glyph. Black / transparent = empty.
            const on = alpha > 128 && lum > 128 ? 1 : 0;
            pixels[y * width + x] = on;
        }
    }
    return { width, height, pixels };
}

// Moore neighborhood clockwise starting from E
const MOORE = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function traceContours(width, height, pixels) {
    const visited = new Uint8Array(width * height);
    const contours = [];

    function isOn(x, y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return 0;
        return pixels[y * width + x];
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (!pixels[idx] || visited[idx]) continue;
            // Only start on a boundary pixel that has an empty left neighbor (outer or hole)
            if (isOn(x - 1, y)) continue;

            const contour = [];
            let cx = x;
            let cy = y;
            // entry direction: coming from west, so previous Moore dir was E (0)
            let dir = 0;
            const startX = x;
            const startY = y;
            let guard = 0;
            const max = width * height * 8;

            do {
                contour.push([cx, cy]);
                visited[cy * width + cx] = 1;
                // Start search from dir+6 (back-left relative) for Moore
                let found = false;
                for (let k = 0; k < 8; k++) {
                    const nd = (dir + 6 + k) % 8;
                    const nx = cx + MOORE[nd][0];
                    const ny = cy + MOORE[nd][1];
                    if (isOn(nx, ny)) {
                        cx = nx;
                        cy = ny;
                        dir = nd;
                        found = true;
                        break;
                    }
                }
                if (!found) break;
                guard++;
            } while ((cx !== startX || cy !== startY) && guard < max);

            if (contour.length >= 8) {
                contours.push(contour);
            }
        }
    }
    return contours;
}

function rdp(points, epsilon) {
    if (points.length < 3) return points.slice();
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = perpDist(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    if (dmax > epsilon) {
        const left = rdp(points.slice(0, index + 1), epsilon);
        const right = rdp(points.slice(index), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [points[0], points[end]];
}

function perpDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;
    return Math.hypot(p[0] - projX, p[1] - projY);
}

function contourArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

function toPath(contours, width, height, target = 1000) {
    // Scale so the larger dimension fits target, with small padding.
    const pad = 0.06;
    const scale = (target * (1 - 2 * pad)) / Math.max(width, height);
    const ox = (target - width * scale) / 2;
    // Flip Y for SVG font convention (y-down bitmap → y-up font-ish square, still y-down SVG is fine)
    const oy = (target - height * scale) / 2;

    // Sort by |area| descending — outer first, holes after
    const ranked = contours
        .map(c => ({ c, area: Math.abs(contourArea(c)) }))
        .sort((a, b) => b.area - a.area);

    // Keep outer + significant holes only
    const mainArea = ranked[0]?.area || 1;
    const keep = ranked.filter((r, i) => i === 0 || r.area > mainArea * 0.01);

    const parts = [];
    for (const { c } of keep) {
        const simplified = rdp(c, Math.max(1.2, Math.min(width, height) * 0.003));
        if (simplified.length < 3) continue;
        const pts = simplified.map(([x, y]) => [
            +(ox + x * scale).toFixed(2),
            +(oy + y * scale).toFixed(2),
        ]);
        let d = `M${pts[0][0]} ${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++) {
            d += `L${pts[i][0]} ${pts[i][1]}`;
        }
        d += 'Z';
        parts.push(d);
    }
    return parts.join('');
}

function main() {
    const input = process.argv[2];
    const output = process.argv[3];
    if (!input || !output) {
        console.error('Usage: node scripts/png-to-codicon-svg.js <input.png> <output.svg>');
        process.exit(1);
    }
    const { width, height, pixels } = readPng(input);
    console.log(`PNG ${width}x${height}`);
    const contours = traceContours(width, height, pixels);
    console.log(`Contours: ${contours.length} (sizes: ${contours.map(c => c.length).join(', ')})`);
    if (!contours.length) {
        console.error('No contours found — check threshold / image colors');
        process.exit(1);
    }
    const d = toPath(contours, width, height, 1000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <path fill="#000" d="${d}"/>
</svg>
`;
    fs.writeFileSync(output, svg, 'utf8');
    console.log('Wrote', path.resolve(output));
}

main();

/**
 * Path helpers for standard markdown links relative to a note file.
 */

import URI from '@theia/core/lib/common/uri';

/** Decode %20 etc. in a link path for resolution. */
export function decodeMdPath(path: string): string {
    try {
        return decodeURIComponent(path.replace(/\\/g, '/'));
    } catch {
        return path.replace(/\\/g, '/');
    }
}

/** Encode spaces for a markdown destination (keep `/` readable). */
export function encodeMdPath(path: string): string {
    return path.replace(/\\/g, '/').split('/').map(seg => encodeURIComponent(seg).replace(/%2B/g, '+')).join('/');
}

/**
 * Resolve a markdown link path against the directory of `fromUri`.
 * Empty path → `fromUri` itself. Adds `.md` when no extension is present
 * and the path does not end with `/`.
 */
export function resolveMarkdownLinkPath(fromUri: URI, path: string): URI {
    const cleaned = decodeMdPath(path).trim();
    if (!cleaned || cleaned === '.' || cleaned === './') {
        return fromUri;
    }
    let rel = cleaned.replace(/^\.\//, '');
    if (rel.endsWith('/')) {
        return fromUri.parent.resolve(rel);
    }
    // Common: link without .md
    if (!/\.[a-zA-Z0-9]+$/.test(rel)) {
        rel = rel + '.md';
    }
    return fromUri.parent.resolve(rel);
}

/**
 * Relative path from `fromUri`'s directory to `toUri`, using `/` separators.
 * Prefers `./name.md` style for same-folder targets.
 */
export function relativeMarkdownPath(fromUri: URI, toUri: URI): string {
    const fromDir = fromUri.path.ext ? fromUri.parent.path.toString() : fromUri.path.toString();
    const toPath = toUri.path.toString();
    const fromParts = fromDir.split('/').filter(Boolean);
    const toParts = toPath.split('/').filter(Boolean);

    let i = 0;
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
    }
    const ups = fromParts.length - i;
    const down = toParts.slice(i);
    const segments = [...Array(ups).fill('..'), ...down];
    if (segments.length === 0) {
        return toUri.path.base;
    }
    let rel = segments.join('/');
    if (!rel.startsWith('.')) {
        rel = './' + rel;
    }
    return rel;
}

/** Lowercased keys useful for matching a note in markdown link paths. */
export function notePathKeys(uri: URI, workspaceRelative?: string): Set<string> {
    const keys = new Set<string>();
    const stem = uri.path.name.toLowerCase();
    keys.add(stem);
    keys.add((stem + '.md').toLowerCase());
    if (workspaceRelative) {
        const rel = workspaceRelative.replace(/\\/g, '/').toLowerCase();
        keys.add(rel);
        keys.add(rel.replace(/\.md$/i, ''));
        const base = rel.split('/').pop();
        if (base) {
            keys.add(base);
            keys.add(base.replace(/\.md$/i, ''));
        }
    }
    return keys;
}

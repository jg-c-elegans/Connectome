import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

export interface UriWithMtime {
    uri: URI;
    mtime: number;
}

/**
 * Resolve mtime for a batch of URIs (best-effort). Missing files get mtime 0.
 */
export async function sortUrisByMtime(
    fileService: FileService,
    uris: URI[],
    options?: { limit?: number; newestFirst?: boolean }
): Promise<UriWithMtime[]> {
    const newestFirst = options?.newestFirst !== false;
    const limit = options?.limit ?? uris.length;
    const concurrency = 15;
    const results: UriWithMtime[] = [];

    for (let i = 0; i < uris.length; i += concurrency) {
        const chunk = uris.slice(i, i + concurrency);
        const stats = await Promise.all(chunk.map(async uri => {
            try {
                const stat = await fileService.resolve(uri, { resolveMetadata: true });
                return { uri, mtime: stat.mtime ?? 0 };
            } catch {
                return { uri, mtime: 0 };
            }
        }));
        results.push(...stats);
    }

    results.sort((a, b) => newestFirst ? b.mtime - a.mtime : a.mtime - b.mtime);
    return results.slice(0, limit);
}

export function formatRelativeTime(mtime: number, now = Date.now()): string {
    if (!mtime) {
        return '';
    }
    const diff = Math.max(0, now - mtime);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) {
        return 'just now';
    }
    if (diff < hour) {
        const m = Math.floor(diff / minute);
        return `${m}m ago`;
    }
    if (diff < day) {
        const h = Math.floor(diff / hour);
        return `${h}h ago`;
    }
    if (diff < 7 * day) {
        const d = Math.floor(diff / day);
        return `${d}d ago`;
    }
    return new Date(mtime).toLocaleDateString();
}

export function isSameLocalDay(a: number, b: number = Date.now()): boolean {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
}

/**
 * Minimal glob matcher supporting `*`, `**`, and `?` against a forward-slash path.
 * No dependency on minimatch/micromatch — Time Machine's exclude list only needs
 * simple directory/extension patterns like `**\/node_modules/**`.
 */
export function globToRegExp(glob: string): RegExp {
    let pattern = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') {
                pattern += '.*';
                i++;
                // consume an optional following slash so **/ matches zero directories too
                if (glob[i + 1] === '/') {
                    i++;
                }
            } else {
                pattern += '[^/]*';
            }
        } else if (c === '?') {
            pattern += '[^/]';
        } else {
            pattern += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp('^' + pattern + '$');
}

export function matchesAnyGlob(relativePath: string, globs: readonly string[]): boolean {
    const normalized = relativePath.replace(/\\/g, '/');
    return globs.some(glob => globToRegExp(glob).test(normalized));
}

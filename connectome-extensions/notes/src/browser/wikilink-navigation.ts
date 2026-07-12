import { injectable, inject } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { NoteIndexService } from './note-index-service';
import { parseWikilinkInner } from './note-parser';

export const WIKILINK_SCHEME = 'connectome-wikilink';

/**
 * Opens resolved wikilinks (with optional heading/block jump) and offers to
 * create a new note when the target does not exist.
 */
@injectable()
export class WikilinkNavigationService {

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    buildLinkUri(fromUri: URI, innerText: string): URI {
        // Prefer command: scheme so Theia's CommandOpenHandler executes our command.
        // Do not pre-encode: URI.withQuery handles encoding; CommandOpenHandler decodes once.
        return new URI('command:connectomeNotes.openWikilink')
            .withQuery(JSON.stringify([fromUri.toString(), innerText]));
    }

    parseLinkUri(uri: URI): { from: URI; inner: string } | undefined {
        if (uri.scheme === 'command' && uri.path.toString() === 'connectomeNotes.openWikilink') {
            try {
                let raw = uri.query || '[]';
                try {
                    raw = decodeURIComponent(raw);
                } catch { /* already decoded */ }
                const args = JSON.parse(raw);
                if (Array.isArray(args) && args.length >= 2) {
                    return { from: new URI(String(args[0])), inner: String(args[1]) };
                }
            } catch {
                return undefined;
            }
        }
        if (uri.scheme !== WIKILINK_SCHEME) {
            return undefined;
        }
        const full = uri.toString();
        const qIndex = full.indexOf('?');
        const qs = qIndex >= 0 ? full.substring(qIndex + 1) : (uri.query || '');
        const params = new URLSearchParams(qs);
        const from = params.get('from');
        const inner = params.get('inner');
        if (!from || inner === null) {
            return undefined;
        }
        return { from: new URI(from), inner };
    }

    async openFromInner(fromUri: URI, innerText: string): Promise<void> {
        const parts = parseWikilinkInner(innerText);
        let targetUri: URI | undefined;
        if (!parts.rawTarget) {
            targetUri = fromUri;
        } else {
            const resolved = this.index.resolveWikilinkDetailed(parts.rawTarget, fromUri);
            if (resolved.ambiguous && resolved.uri) {
                await this.messages.warn(
                    `Multiple notes match “${parts.rawTarget}”; opening ${this.index.getWorkspaceRelativePath(resolved.uri)}.`);
            }
            targetUri = resolved.uri;
        }

        if (!targetUri) {
            const created = await this.confirmAndCreate(fromUri, parts.rawTarget);
            if (!created) {
                return;
            }
            targetUri = created;
        }

        await this.openAtFragment(targetUri, parts.fragment, parts.isBlockFragment);
    }

    async openAtFragment(uri: URI, fragment: string | undefined, isBlock: boolean): Promise<void> {
        let selection: { start: { line: number; character: number }; end: { line: number; character: number } } | undefined;
        if (fragment) {
            const line = isBlock
                ? this.index.findBlockLine(uri, fragment)
                : this.index.findHeadingLine(uri, fragment);
            if (line === undefined) {
                await this.editorManager.open(uri);
                const kind = isBlock ? 'block' : 'heading';
                await this.messages.info(`Opened note, but ${kind} “${fragment}” was not found.`);
                return;
            }
            selection = {
                start: { line, character: 0 },
                end: { line, character: 0 }
            };
        }
        await this.editorManager.open(uri, selection ? { selection } : undefined);
    }

    protected async confirmAndCreate(fromUri: URI, rawTarget: string): Promise<URI | undefined> {
        const target = rawTarget.trim().replace(/\.md$/i, '');
        if (!target) {
            return undefined;
        }
        const destination = this.defaultCreateUri(fromUri, target);
        const relative = this.index.getWorkspaceRelativePath(destination);
        const confirmed = await new ConfirmDialog({
            title: 'Create note',
            msg: `Note “${target}” does not exist. Create ${relative}?`,
            ok: 'Create',
            cancel: 'Cancel'
        }).open();
        if (!confirmed) {
            return undefined;
        }
        return this.createNote(destination, target);
    }

    async createNote(destination: URI, titleHint?: string): Promise<URI> {
        const parent = destination.parent;
        if (!await this.fileService.exists(parent)) {
            await this.fileService.createFolder(parent);
        }
        if (await this.fileService.exists(destination)) {
            return destination;
        }
        const title = titleHint?.split('/').pop() || destination.path.name;
        const body = `# ${title}\n\n`;
        await this.fileService.create(destination, body);
        await this.index.indexUri(destination, body);
        await this.editorManager.open(destination);
        return destination;
    }

    defaultCreateUri(fromUri: URI, rawTarget: string): URI {
        const cleaned = rawTarget.trim().replace(/\\/g, '/').replace(/\.md$/i, '');
        const segments = cleaned.split('/').filter(Boolean).map(seg =>
            seg.replace(/[<>:"|?*]/g, '_').trim() || 'note');
        if (segments.length === 0) {
            segments.push('untitled');
        }
        let base = fromUri.path.ext.toLowerCase() === '.md' ? fromUri.parent : fromUri;
        if (!this.workspaceService.getWorkspaceRootUri(fromUri)) {
            const roots = this.workspaceService.tryGetRoots();
            if (roots.length > 0) {
                base = roots[0].resource;
            }
        }
        let uri = base;
        for (let i = 0; i < segments.length - 1; i++) {
            uri = uri.resolve(segments[i]);
        }
        return uri.resolve(segments[segments.length - 1] + '.md');
    }
}

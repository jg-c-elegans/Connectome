import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

/**
 * Shared helpers for copying binary assets next to a note and building markdown.
 */
@injectable()
export class NoteAssetService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    isImageExtension(ext: string): boolean {
        return IMAGE_EXTENSIONS.has(ext.toLowerCase());
    }

    async resolveAssetsDir(noteUri: URI): Promise<URI> {
        let base = noteUri.parent;
        if (!this.workspaceService.getWorkspaceRootUri(noteUri)) {
            const roots = this.workspaceService.tryGetRoots();
            if (roots.length > 0) {
                base = roots[0].resource;
            }
        }
        const assetsDir = base.resolve('assets');
        if (!await this.fileService.exists(assetsDir)) {
            await this.fileService.createFolder(assetsDir);
        }
        return assetsDir;
    }

    async writeBytesToAssets(assetsDir: URI, fileName: string, bytes: Uint8Array): Promise<URI> {
        const sanitized = fileName.replace(/[/\\]/g, '_') || 'asset';
        const dot = sanitized.lastIndexOf('.');
        const stem = dot > 0 ? sanitized.substring(0, dot) : sanitized;
        const ext = dot > 0 ? sanitized.substring(dot) : '';
        let destination = assetsDir.resolve(sanitized);
        for (let counter = 1; await this.fileService.exists(destination); counter++) {
            destination = assetsDir.resolve(`${stem}-${counter}${ext}`);
        }
        await this.fileService.writeFile(destination, BinaryBuffer.wrap(bytes));
        return destination;
    }

    async copyFileToAssets(file: File, assetsDir: URI): Promise<URI> {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return this.writeBytesToAssets(assetsDir, file.name || 'asset', bytes);
    }

    markdownFor(noteUri: URI, assetUri: URI, alt?: string): string {
        const relative = noteUri.parent.relative(assetUri);
        const path = (relative ? relative.toString() : assetUri.path.toString()).replace(/ /g, '%20');
        const ext = assetUri.path.ext.toLowerCase();
        const name = alt ?? assetUri.path.name;
        if (IMAGE_EXTENSIONS.has(ext)) {
            return `![${name}](${path})`;
        }
        return `[${assetUri.path.base}](${path})`;
    }
}

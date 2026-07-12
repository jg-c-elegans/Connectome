import { injectable } from '@theia/core/shared/inversify';
import {
    THEIA_EXT,
    VSCODE_EXT,
    WorkspaceFileService,
    WorkspaceFileType,
} from '@theia/workspace/lib/common';

/** Connectome multi-root workspace file extension (same JSON shape as Theia/VS Code). */
export const CONNECTOME_EXT = 'connectome-workspace';

/**
 * Adds Connectome (*.connectome-workspace) as the first/default workspace file type
 * for save-dialog filters and isWorkspaceFile detection.
 */
@injectable()
export class ConnectomeWorkspaceFileService extends WorkspaceFileService {

    override getWorkspaceFileTypes(): WorkspaceFileType[] {
        return [
            {
                name: 'Connectome',
                extension: CONNECTOME_EXT,
            },
            {
                name: 'Theia',
                extension: THEIA_EXT,
            },
            {
                name: 'Visual Studio Code',
                extension: VSCODE_EXT,
            },
        ];
    }
}

import { ContainerModule } from '@theia/core/shared/inversify';
import { WorkspaceFileService } from '@theia/workspace/lib/common';
import { ConnectomeWorkspaceFileService } from '../common/connectome-workspace-file-service';

/**
 * Backend rebind so *.connectome-workspace is recognized when opening a saved workspace.
 * Frontend has a matching rebind for the Save Workspace dialog filters.
 */
export default new ContainerModule((bind, unbind, isBound, rebind) => {
    if (isBound(WorkspaceFileService)) {
        rebind(WorkspaceFileService).to(ConnectomeWorkspaceFileService).inSingletonScope();
    } else {
        bind(WorkspaceFileService).to(ConnectomeWorkspaceFileService).inSingletonScope();
    }
});

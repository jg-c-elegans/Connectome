import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { OS } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { ShellTerminalProfile } from '@theia/terminal/lib/browser/shell-terminal-profile';
import {
    ContributedTerminalProfileStore,
    TerminalProfileService,
    TerminalProfileStore,
} from '@theia/terminal/lib/browser/terminal-profile-service';
import URI from '@theia/core/lib/common/uri';

/**
 * Absolute Windows PowerShell paths. Bare `powershell.exe` fails Theia's
 * `resolveShellPath` (requires `fileService.exists` on a concrete path), so
 * preference-only registration never appears in the profile picker.
 *
 * Theia discussion #13792 only rewrites the existing `cmd` profile path to
 * powershell.exe — that makes "New Terminal" open PowerShell but never adds a
 * selectable PowerShell profile. We register a real contributed profile instead.
 */
export const WINDOWS_POWERSHELL_PATHS = [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
];

export const POWERSHELL_PROFILE_ID = 'PowerShell';

@injectable()
export class ConnectomeTerminalContribution implements FrontendApplicationContribution {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(ContributedTerminalProfileStore)
    protected readonly contributedProfiles: TerminalProfileStore;

    @inject(TerminalProfileService)
    protected readonly profileService: TerminalProfileService;

    @inject(FileService)
    protected readonly fileService: FileService;

    async onStart(): Promise<void> {
        if (OS.backend.type() !== OS.Type.Windows) {
            return;
        }
        // TerminalFrontendContribution.onStart contributes `cmd` and runs
        // mergePreferences asynchronously. Register PowerShell after that work
        // has had a chance to finish, then re-assert default once more so we
        // win any race with preference merge.
        await new Promise<void>(resolve => setTimeout(resolve, 50));
        await this.ensurePowerShellProfile();
        await new Promise<void>(resolve => setTimeout(resolve, 200));
        try {
            if (this.profileService.getProfile(POWERSHELL_PROFILE_ID)) {
                this.profileService.setDefaultProfile(POWERSHELL_PROFILE_ID);
            }
        } catch {
            // ignore
        }
    }

    protected async ensurePowerShellProfile(): Promise<void> {
        const shellPath = await this.resolvePowerShellPath();
        if (!shellPath) {
            console.warn('[connectome-terminal] PowerShell executable not found; leaving cmd as-is');
            return;
        }
        this.contributedProfiles.registerTerminalProfile(
            POWERSHELL_PROFILE_ID,
            new ShellTerminalProfile(this.terminalService, {
                shellPath,
                // Match VS Code / Windows Terminal naming in the profile picker.
                title: POWERSHELL_PROFILE_ID,
                useServerTitle: false,
                iconClass: 'codicon codicon-terminal-powershell',
            })
        );
        try {
            this.profileService.setDefaultProfile(POWERSHELL_PROFILE_ID);
        } catch (err) {
            console.warn('[connectome-terminal] could not set PowerShell as default profile:', err);
        }
        console.info('[connectome-terminal] registered PowerShell profile:', shellPath);
    }

    protected async resolvePowerShellPath(): Promise<string | undefined> {
        for (const candidate of WINDOWS_POWERSHELL_PATHS) {
            try {
                if (await this.fileService.exists(URI.fromFilePath(candidate))) {
                    return candidate;
                }
            } catch {
                // try next
            }
        }
        return undefined;
    }
}

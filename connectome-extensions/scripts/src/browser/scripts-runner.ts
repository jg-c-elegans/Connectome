import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { ScriptLanguage } from './scripts-view-container';

/** Spawns a fresh terminal and runs the given script with no arguments. Mirrors code-fence-runner-contribution.ts. */
export async function runScript(terminalService: TerminalService, fsPath: string, language: ScriptLanguage, title: string): Promise<void> {
    const shellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const term = await terminalService.newTerminal({
        title,
        shellPath,
        shellArgs: ['-NoLogo'],
        destroyTermOnClose: true,
        useServerTitle: false,
    });

    await term.start();
    await terminalService.open(term);

    const runCommand = language === 'python' ? `python "${fsPath}"` : `& "${fsPath}"`;

    setTimeout(() => {
        if (!term.isDisposed) {
            term.sendText(`${runCommand}\r`);
        }
    }, 300);
}

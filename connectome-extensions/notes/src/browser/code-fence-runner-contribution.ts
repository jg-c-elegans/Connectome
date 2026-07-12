import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import URI from '@theia/core/lib/common/uri';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class CodeFenceRunnerContribution implements FrontendApplicationContribution {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly supportedLanguages = new Set([
        'python', 'py',
        'bash', 'sh', 'shell',
        'powershell', 'ps1',
        'node', 'js', 'javascript',
        'typescript', 'ts',
        'yarn', 'npm', 'choco', 'scoop'
    ]);

    onStart(): void {
        this.registerCodeLensProvider();
        this.registerMonacoCommand();
    }

    protected isLanguageSupported(lang: string): boolean {
        return this.supportedLanguages.has(lang.toLowerCase());
    }

    protected registerCodeLensProvider(): void {
        monaco.languages.registerCodeLensProvider('markdown', {
            provideCodeLenses: (model, token) => {
                const lenses: monaco.languages.CodeLens[] = [];
                const lineCount = model.getLineCount();
                let inFence = false;
                let fenceStartLine = -1;
                let fenceLanguage = '';

                for (let line = 1; line <= lineCount; line++) {
                    const text = model.getLineContent(line);
                    const match = text.match(/^\s*(```|~~~)\s*([\w-]+)?/);
                    if (match) {
                        if (!inFence) {
                            inFence = true;
                            fenceStartLine = line;
                            fenceLanguage = (match[2] || '').toLowerCase().trim();
                        } else {
                            inFence = false;
                            if (this.isLanguageSupported(fenceLanguage)) {
                                lenses.push({
                                    range: new monaco.Range(fenceStartLine, 1, fenceStartLine, 1),
                                    command: {
                                        id: 'connectome.runCodeFence',
                                        title: `▶ Run ${fenceLanguage}`,
                                        arguments: [model.uri.toString(), fenceStartLine, line, fenceLanguage]
                                    }
                                });
                            }
                        }
                    }
                }
                return { lenses };
            },
            resolveCodeLens: (model, codeLens, token) => {
                return codeLens;
            }
        });
    }

    protected registerMonacoCommand(): void {
        monaco.editor.registerCommand('connectome.runCodeFence', (accessor, uriStr: string, startLine: number, endLine: number, language: string) => {
            void this.runCodeBlock(uriStr, startLine, endLine, language);
        });
    }

    protected async runCodeBlock(uriStr: string, startLine: number, endLine: number, language: string): Promise<void> {
        const model = monaco.editor.getModel(monaco.Uri.parse(uriStr));
        if (!model) {
            return;
        }

        const lines: string[] = [];
        for (let line = startLine + 1; line < endLine; line++) {
            lines.push(model.getLineContent(line));
        }
        const code = lines.join('\n');

        const uri = new URI(uriStr);
        const roots = this.workspaceService.tryGetRoots();
        let baseDir: URI;
        if (roots.length > 0) {
            baseDir = roots[0].resource;
        } else {
            baseDir = uri.parent;
        }

        const scratchDir = baseDir.resolve('.connectome-scratch');
        try {
            if (!await this.fileService.exists(scratchDir)) {
                await this.fileService.createFolder(scratchDir);
            }
        } catch (err) {
            console.error('[code-fence-runner] Failed to create scratch folder:', err);
            return;
        }

        let ext = '.ps1';
        const langLower = language.toLowerCase();
        if (langLower === 'python' || langLower === 'py') {
            ext = '.py';
        } else if (langLower === 'node' || langLower === 'js' || langLower === 'javascript') {
            ext = '.js';
        }

        const scratchFile = scratchDir.resolve(`scratch_${langLower}${ext}`);
        let fsPath: string;
        try {
            await this.fileService.writeFile(scratchFile, BinaryBuffer.fromString(code));
            fsPath = FileUri.fsPath(scratchFile);
        } catch (err) {
            console.error('[code-fence-runner] Failed to write scratch file:', err);
            return;
        }

        const shellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        const title = `Run: ${language}`;

        try {
            const term = await this.terminalService.newTerminal({
                title,
                shellPath,
                shellArgs: ['-NoLogo'],
                destroyTermOnClose: true,
                useServerTitle: false,
            });

            await term.start();
            await this.terminalService.open(term);

            let runCommand = '';
            if (ext === '.py') {
                runCommand = `python "${fsPath}"`;
            } else if (ext === '.js') {
                runCommand = `node "${fsPath}"`;
            } else {
                runCommand = `& "${fsPath}"`;
            }

            setTimeout(() => {
                if (!term.isDisposed) {
                    term.sendText(`${runCommand}\r`);
                }
            }, 300);

        } catch (err) {
            console.error('[code-fence-runner] Failed to start/run in terminal:', err);
        }
    }
}

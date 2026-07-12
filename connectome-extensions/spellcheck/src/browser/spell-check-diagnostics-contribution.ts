import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { SpellCheckService } from './spell-check-service';
import { SpellCheckStateService } from './spell-check-state';
import { tokenizeProse, tokenizeCode } from './spell-check-tokenizer';

export const MARKER_OWNER = 'connectome-spellcheck';
export const DIAGNOSTIC_SOURCE = 'Spelling';

/** Full-document prose scan; frontmatter/fences/code-spans/links already excluded by the tokenizer. */
export const PROSE_LANGUAGE_IDS = new Set(['markdown', 'plaintext']);
/** Comment/string-only scan via Monaco's own tokenizer. */
export const CODE_LANGUAGE_IDS = new Set(['python', 'typescript', 'typescriptreact', 'javascript', 'javascriptreact']);
export const SPELL_CHECK_LANGUAGE_IDS = new Set([...PROSE_LANGUAGE_IDS, ...CODE_LANGUAGE_IDS]);

export const SPELL_CHECKED_EXTENSIONS = new Set([
    '.md', '.markdown', '.txt', '.py', '.ts', '.tsx', '.js', '.jsx'
]);

const DEBOUNCE_MS = 300;
const MAX_CHECKABLE_LENGTH = 1_000_000;

type Control = monaco.editor.IStandaloneCodeEditor;

/**
 * Spell-check diagnostics using the same editor lifecycle as callout decorations
 * (EditorManager + MonacoEditor.get) and the same ProblemManager publish path as
 * notes broken-wikilink diagnostics. Dual-writes Monaco model markers so
 * squiggles and code actions see source "Spelling" immediately.
 */
@injectable()
export class SpellCheckDiagnosticsContribution implements FrontendApplicationContribution {

    @inject(ProblemManager)
    protected readonly problems: ProblemManager;

    @inject(SpellCheckService)
    protected readonly spellCheck: SpellCheckService;

    @inject(SpellCheckStateService)
    protected readonly state: SpellCheckStateService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected readonly toDispose = new DisposableCollection();
    protected readonly attached = new Set<string>();
    protected readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();

    onStart(): void {
        this.editorManager.all.forEach(w => this.attach(w));
        this.toDispose.push(this.editorManager.onCreated(w => this.attach(w)));
        this.toDispose.push(this.state.onDidChange(() => this.refreshOpenEditors()));
        this.toDispose.push(this.spellCheck.onDidChange(() => this.refreshOpenEditors()));
        void this.spellCheck.ready.then(() => {
            if (!this.spellCheck.isReady) {
                console.error(
                    '[connectome-spellcheck] not ready —',
                    this.spellCheck.lastError ?? 'unknown error'
                );
                return;
            }
            this.refreshOpenEditors();
        });
    }

    protected attach(widget: EditorWidget): void {
        const ext = widget.editor.uri.path.ext.toLowerCase();
        if (!SPELL_CHECKED_EXTENSIONS.has(ext)) {
            return;
        }
        const monacoEditor = MonacoEditor.get(widget);
        if (!monacoEditor) {
            return;
        }
        const control = monacoEditor.getControl();
        const key = widget.editor.uri.toString();
        if (this.attached.has(key)) {
            return;
        }
        this.attached.add(key);

        const schedule = () => this.scheduleCheck(control, key);
        schedule();

        const contentSub = control.onDidChangeModelContent(() => schedule());
        const modelSub = control.onDidChangeModel(() => schedule());
        const disposeAll = () => {
            contentSub.dispose();
            modelSub.dispose();
            this.attached.delete(key);
            const timeout = this.timeouts.get(key);
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
            this.timeouts.delete(key);
            this.clearMarkersForControl(control);
        };
        widget.disposed.connect(() => disposeAll());
        this.toDispose.push(Disposable.create(disposeAll));
    }

    protected scheduleCheck(control: Control, key: string): void {
        const existing = this.timeouts.get(key);
        if (existing !== undefined) {
            clearTimeout(existing);
        }
        this.timeouts.set(key, setTimeout(() => {
            this.timeouts.delete(key);
            this.runCheck(control).catch(err => {
                console.error('[connectome-spellcheck] runCheck failed:', err);
            });
        }, DEBOUNCE_MS));
    }

    protected refreshOpenEditors(): void {
        for (const widget of this.editorManager.all) {
            const ext = widget.editor.uri.path.ext.toLowerCase();
            if (!SPELL_CHECKED_EXTENSIONS.has(ext)) {
                continue;
            }
            const monacoEditor = MonacoEditor.get(widget);
            if (!monacoEditor) {
                continue;
            }
            const control = monacoEditor.getControl();
            if (!this.state.enabled) {
                this.clearMarkersForControl(control);
                continue;
            }
            this.scheduleCheck(control, widget.editor.uri.toString());
        }
    }

    protected async runCheck(control: Control): Promise<void> {
        const model = control.getModel();
        if (!model) {
            return;
        }
        if (!this.state.enabled) {
            this.clearMarkersForControl(control);
            return;
        }

        const ext = this.extensionFromModel(model);
        const languageId = model.getLanguageId();
        const isProseExt = ext === '.md' || ext === '.markdown' || ext === '.txt';
        const isCodeExt = ext === '.py' || ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx';
        const isProse = PROSE_LANGUAGE_IDS.has(languageId) || isProseExt;
        const isCode = CODE_LANGUAGE_IDS.has(languageId) || (isCodeExt && !isProseExt);
        if (!isProse && !isCode) {
            this.clearMarkersForControl(control);
            return;
        }
        if (model.getValueLength() > MAX_CHECKABLE_LENGTH) {
            this.clearMarkersForControl(control);
            return;
        }

        await this.spellCheck.ready;
        if (!this.spellCheck.isReady) {
            this.clearMarkersForControl(control);
            return;
        }

        const tokens = isProse ? tokenizeProse(model.getValue()) : tokenizeCode(model);
        const diagnostics: Diagnostic[] = [];
        const monacoMarkers: monaco.editor.IMarkerData[] = [];
        for (const token of tokens) {
            if (this.spellCheck.checkSync(token.word)) {
                continue;
            }
            diagnostics.push({
                range: {
                    start: { line: token.line, character: token.startCol },
                    end: { line: token.line, character: token.endCol }
                },
                message: `Possibly misspelled word: "${token.word}"`,
                severity: DiagnosticSeverity.Warning,
                source: DIAGNOSTIC_SOURCE,
                code: token.word
            });
            monacoMarkers.push({
                severity: monaco.MarkerSeverity.Warning,
                message: `Possibly misspelled word: "${token.word}"`,
                startLineNumber: token.line + 1,
                startColumn: token.startCol + 1,
                endLineNumber: token.line + 1,
                endColumn: token.endCol + 1,
                source: DIAGNOSTIC_SOURCE,
                code: token.word
            });
        }

        // Same URI key MonacoLanguages uses (model.uri.toString()).
        const theiaUri = new URI(model.uri.toString());
        this.problems.setMarkers(theiaUri, MARKER_OWNER, diagnostics);
        monaco.editor.setModelMarkers(model, MARKER_OWNER, monacoMarkers);
    }

    protected extensionFromModel(model: monaco.editor.ITextModel): string {
        const path = model.uri.path;
        const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        const base = slash >= 0 ? path.slice(slash + 1) : path;
        const dot = base.lastIndexOf('.');
        return dot >= 0 ? base.slice(dot).toLowerCase() : '';
    }

    protected clearMarkersForControl(control: Control): void {
        const model = control.getModel();
        if (!model) {
            return;
        }
        this.problems.setMarkers(new URI(model.uri.toString()), MARKER_OWNER, []);
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
}

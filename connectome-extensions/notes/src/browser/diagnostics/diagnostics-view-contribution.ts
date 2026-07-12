import { injectable, inject } from '@theia/core/shared/inversify';
import { AbstractViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import URI from '@theia/core/lib/common/uri';
import { DiagnosticsWidget } from './diagnostics-widget';
import { NOTES_VIEW_CONTAINER_ID } from '../notes-view-container';
import { NoteIndexService } from '../note-index-service';

const MARKER_OWNER = 'connectome-notes';

@injectable()
export class DiagnosticsViewContribution extends AbstractViewContribution<DiagnosticsWidget>
    implements FrontendApplicationContribution {

    @inject(NoteIndexService)
    protected readonly index: NoteIndexService;

    @inject(ProblemManager)
    protected readonly problems: ProblemManager;

    constructor() {
        super({
            widgetId: DiagnosticsWidget.ID,
            viewContainerId: NOTES_VIEW_CONTAINER_ID,
            widgetName: DiagnosticsWidget.LABEL,
            defaultWidgetOptions: { area: 'left', rank: 300 },
            toggleCommandId: 'connectomeNotes.diagnostics.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }

    onStart(): void {
        this.index.onDidUpdate(() => this.publishMarkers());
        // publish after index init completes asynchronously
        this.index.initialize().then(() => this.publishMarkers());
    }

    protected publishMarkers(): void {
        // Clear previous markers for known note uris
        for (const uri of this.index.getAllNoteUris()) {
            this.problems.setMarkers(uri, MARKER_OWNER, []);
        }
        const byUri = new Map<string, Diagnostic[]>();
        for (const broken of this.index.getBrokenLinks()) {
            const list = byUri.get(broken.sourceUri) ?? [];
            list.push({
                range: {
                    start: { line: broken.link.line, character: broken.link.startCol },
                    end: { line: broken.link.line, character: broken.link.endCol }
                },
                message: `Unresolved wikilink: [[${broken.link.innerText}]]`,
                severity: DiagnosticSeverity.Warning,
                source: 'Connectome Notes'
            });
            byUri.set(broken.sourceUri, list);
        }
        for (const [uri, diags] of byUri) {
            this.problems.setMarkers(new URI(uri), MARKER_OWNER, diags);
        }
    }
}

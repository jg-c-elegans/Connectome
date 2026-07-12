import * as React from '@theia/core/shared/react';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget, codicon } from '@theia/core/lib/browser/widgets';

@injectable()
export class EmbedPreviewWidget extends ReactWidget {

    static readonly ID = 'connectome-embed-preview';
    static readonly LABEL = 'Note Preview';

    protected titleText = 'Note Preview';
    protected html = '';

    @postConstruct()
    protected init(): void {
        this.id = EmbedPreviewWidget.ID;
        this.title.label = EmbedPreviewWidget.LABEL;
        this.title.caption = 'Markdown preview with embeds expanded';
        this.title.iconClass = codicon('open-preview');
        this.title.closable = true;
        this.addClass('connectome-embed-preview');
        this.update();
    }

    setContent(title: string, html: string): void {
        this.titleText = title;
        this.title.label = `Preview: ${title}`;
        this.html = html;
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        if (!this.html) {
            return <div className='connectome-notes-empty'>No preview content.</div>;
        }
        // iframe sandbox keeps simple HTML isolated; srcDoc avoids external navigation
        return <iframe
            className='connectome-embed-preview-frame'
            title={this.titleText}
            sandbox='allow-same-origin'
            srcDoc={this.html}
        />;
    }
}

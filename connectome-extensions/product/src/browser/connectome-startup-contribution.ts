/********************************************************************************
 * Copyright (C) 2026 James Grimm / Elegans Labs and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    WidgetManager,
} from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';

/**
 * Force a clean startup surface: always open the Connectome welcome page.
 *
 * Upstream GettingStartedContribution only opens welcome when
 * `editorManager.all.length === 0`, and restored non-editor main widgets
 * (e.g. Browser tabs) can steal focus. We always activate welcome after ready.
 */
@injectable()
export class ConnectomeStartupContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    onStart(): void {
        void this.appState.reachedState('ready').then(() => {
            void this.openWelcome(true);
            // One delayed pass beats layout restore / browser-tab cleanup races.
            // After that, do not keep re-activating (user may have opened a file).
            setTimeout(() => void this.openWelcome(false), 400);
        });
    }

    /**
     * @param force always activate welcome (initial ready path).
     * @param force=false only activate if main is empty or still a Browser tab.
     */
    protected async openWelcome(force: boolean): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(GettingStartedWidget.ID);
        if (!this.shell.getWidgetById(widget.id)) {
            await this.shell.addWidget(widget, { area: 'main' });
        }

        if (force) {
            this.shell.activateWidget(widget.id);
            return;
        }

        const current = this.shell.currentWidget;
        const stillBrowser = !!current?.id.startsWith('connectome-browser:');
        const noMain = !current;
        const alreadyWelcome = current?.id === GettingStartedWidget.ID;
        if (stillBrowser || noMain || alreadyWelcome) {
            this.shell.activateWidget(widget.id);
        }
    }
}

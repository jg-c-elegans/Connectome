/********************************************************************************
 * Copyright (C) 2026 Elegans Labs.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    TheiaSplitPanel,
} from '@theia/core/lib/browser';
import { TheiaDockPanel } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { Layout } from '@theia/core/shared/@lumino/widgets';

/**
 * Reserves real Lumino layout gaps so shell regions read as separated cards over the
 * canvas background. CSS alone cannot create these gaps: SplitLayout/BoxLayout place
 * siblings from their `spacing` option, not from handle CSS size.
 *
 * Overrides match upstream ApplicationShell methods with spacing changed from 0 → 8.
 * On @theia/core upgrades, diff createLayout/createMainPanel/createBottomPanel against
 * node_modules/@theia/core/src/browser/shell/application-shell.ts.
 */
@injectable()
export class ConnectomeApplicationShell extends ApplicationShell {

    protected override createMainPanel(): TheiaDockPanel {
        const panel = super.createMainPanel();
        panel.spacing = 8;
        return panel;
    }

    protected override createBottomPanel(): TheiaDockPanel {
        const panel = super.createBottomPanel();
        panel.spacing = 8;
        return panel;
    }

    protected override createLayout(): Layout {
        const bottomSplitLayout = this.createSplitLayout(
            [this.mainPanel, this.bottomPanel],
            [1, 0],
            { orientation: 'vertical', spacing: 8 },
        );
        const panelForBottomArea = new TheiaSplitPanel({ layout: bottomSplitLayout });
        panelForBottomArea.id = 'theia-bottom-split-panel';

        const leftRightSplitLayout = this.createSplitLayout(
            [this.leftPanelHandler.container, panelForBottomArea, this.rightPanelHandler.container],
            [0, 1, 0],
            { orientation: 'horizontal', spacing: 8 },
        );
        const panelForSideAreas = new TheiaSplitPanel({ layout: leftRightSplitLayout });
        panelForSideAreas.id = 'theia-left-right-split-panel';

        return this.createBoxLayout(
            [this.topPanel, panelForSideAreas, this.statusBar],
            [0, 1, 0],
            { direction: 'top-to-bottom', spacing: 8 },
        );
    }
}

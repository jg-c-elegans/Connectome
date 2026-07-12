/********************************************************************************
 * Copyright (C) 2026 Elegans Labs.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { SidePanelHandler } from '@theia/core/lib/browser';
import {
    BoxLayout,
    BoxPanel,
    Panel,
    PanelLayout,
} from '@theia/core/shared/@lumino/widgets';
import { CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH } from './agents/agent-ids';

/**
 * Gaps the activity-icon rail from the side-panel content card, and sets a
 * fixed default width for the **right** panel only (Claude/Codex terminals).
 *
 * Overrides createContainer() from SidePanelHandler with only the outer
 * containerLayout spacing changed. Keep this small (not 8): the rails sit
 * flush to the window edge, so a large rail↔card gap reads as uneven.
 * contentBox (toolbar ↔ dock) stays at spacing 0 for a seamless side card.
 *
 * On @theia/core upgrades, diff against
 * node_modules/@theia/core/src/browser/shell/side-panel-handler.ts.
 */
@injectable()
export class ConnectomeSidePanelHandler extends SidePanelHandler {

    /** Canvas gap between activity icons and the Explorer/side card (both sides). */
    static readonly RAIL_CONTENT_SPACING = 4;

    /**
     * First expand with content uses this when no lastPanelSize is stored.
     * Left panel keeps Theia's ratio-based default.
     */
    protected override getDefaultPanelSize(): number | undefined {
        if (this.side === 'right') {
            return CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH;
        }
        return super.getDefaultPanelSize();
    }

    protected override createContainer(): Panel {
        const contentBox = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 });
        BoxPanel.setStretch(this.toolBar, 0);
        contentBox.addWidget(this.toolBar);
        BoxPanel.setStretch(this.dockPanel, 1);
        contentBox.addWidget(this.dockPanel);
        const contentPanel = new BoxPanel({ layout: contentBox });

        const side = this.side;
        let direction: BoxLayout.Direction;
        switch (side) {
            case 'left':
                direction = 'left-to-right';
                break;
            case 'right':
                direction = 'right-to-left';
                break;
            default:
                throw new Error('Illegal argument: ' + side);
        }

        const containerLayout = new BoxLayout({
            direction,
            spacing: ConnectomeSidePanelHandler.RAIL_CONTENT_SPACING,
        });
        const sidebarContainerLayout = new PanelLayout();
        const sidebarContainer = new Panel({ layout: sidebarContainerLayout });
        sidebarContainer.addClass('theia-app-sidebar-container');
        sidebarContainerLayout.addWidget(this.topMenu);
        sidebarContainerLayout.addWidget(this.tabBar);
        sidebarContainerLayout.addWidget(this.additionalViewsMenu);
        sidebarContainerLayout.addWidget(this.bottomMenu);

        BoxPanel.setStretch(sidebarContainer, 0);
        BoxPanel.setStretch(contentPanel, 1);
        containerLayout.addWidget(sidebarContainer);
        containerLayout.addWidget(contentPanel);

        const boxPanel = new BoxPanel({ layout: containerLayout });
        boxPanel.id = 'theia-' + side + '-content-panel';
        return boxPanel;
    }
}

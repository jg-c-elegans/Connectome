/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export namespace ConnectomeMenus {
    export const CONNECTOME_HELP: MenuPath = [...CommonMenus.HELP, 'connectome'];
}
export namespace ConnectomeCommands {
    export const CATEGORY = 'Connectome';
    export const REPORT_ISSUE: Command = {
        id: 'connectome:report-issue',
        category: CATEGORY,
        label: 'Report Issue'
    };
    export const DOCUMENTATION: Command = {
        id: 'connectome:documentation',
        category: CATEGORY,
        label: 'Documentation'
    };
}

@injectable()
export class ConnectomeContribution implements CommandContribution, MenuContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    static REPORT_ISSUE_URL = 'https://github.com/jg-c-elegans/connectome/issues';
    static DOCUMENTATION_URL = 'https://github.com/jg-c-elegans/connectome#readme';

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(ConnectomeCommands.REPORT_ISSUE, {
            execute: () => this.windowService.openNewWindow(ConnectomeContribution.REPORT_ISSUE_URL, { external: true })
        });
        commandRegistry.registerCommand(ConnectomeCommands.DOCUMENTATION, {
            execute: () => this.windowService.openNewWindow(ConnectomeContribution.DOCUMENTATION_URL, { external: true })
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(ConnectomeMenus.CONNECTOME_HELP, {
            commandId: ConnectomeCommands.REPORT_ISSUE.id,
            label: ConnectomeCommands.REPORT_ISSUE.label,
            order: '1'
        });
        menus.registerMenuAction(ConnectomeMenus.CONNECTOME_HELP, {
            commandId: ConnectomeCommands.DOCUMENTATION.id,
            label: ConnectomeCommands.DOCUMENTATION.label,
            order: '2'
        });
    }
}

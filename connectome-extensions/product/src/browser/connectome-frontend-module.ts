/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { AIRegistryConfiguration } from '@theia/ai-registry/lib/common/ai-registry-configuration';
import {
    ApplicationShell,
    ApplicationShellOptions,
    bindViewContribution,
    FrontendApplicationContribution,
    SidePanelHandler,
    ViewContainer,
    WidgetFactory,
    WidgetManager,
} from '@theia/core/lib/browser';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';

import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import {
    PreferenceContribution,
    PreferenceSchemaService,
} from '@theia/core/lib/common/preferences/preference-schema';
import { ContainerModule } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { WorkspaceFileService } from '@theia/workspace/lib/common';
import { ConnectomeAboutDialog } from './connectome-about-dialog';
import { ConnectomeAIRegistryConfiguration } from './connectome-ai-registry-configuration';
import { ConnectomeApplicationShell } from './connectome-application-shell';
import { ConnectomeContribution } from './connectome-contribution';
import { ConnectomeGettingStartedWidget } from './connectome-getting-started-widget';
import { ConnectomeSidePanelHandler } from './connectome-side-panel-handler';
import { ConnectomeThemeContribution } from './connectome-theme-contribution';
import { ConnectomeEditorPaddingContribution } from './connectome-editor-padding-contribution';
import { MemoryInspectorIconContribution } from './memory-inspector-icon-contribution';
import { RailOrderContribution } from './rail-order-contribution';
import { ConnectomeStartupContribution } from './connectome-startup-contribution';
import { AGENT_DEFINITIONS, CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH } from './agents/agent-ids';
import { AgentLauncherWidget } from './agents/agent-launcher-widget';
import { AgentSessionContribution } from './agents/agent-session-contribution';
import { AgentSessionLogService } from './agents/agent-session-log-service';
import { AgentSessionLogWidget } from './agents/agent-session-log-widget';
import { AgentSessionLogContribution } from './agents/agent-session-log-contribution';
import {
    AGENT_SESSION_LOG_VIEW_CONTAINER_ID,
    AGENT_SESSION_LOG_VIEW_CONTAINER_TITLE_OPTIONS
} from './agents/agent-session-log-view-container';
import { ConnectomeWorkspaceFileService } from '../common/connectome-workspace-file-service';
import { ConnectomeTerminalContribution } from './connectome-terminal-contribution';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    // Default right sidebar size only (left panel keeps Theia defaults).
    if (isBound(ApplicationShellOptions)) {
        rebind(ApplicationShellOptions).toConstantValue({
            rightPanel: {
                emptySize: CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH,
                expandThreshold: 140,
                expandDuration: 0,
                // Fallback ratio if pixel default is not used; prefer fixed width via SidePanelHandler.
                initialSizeRatio: 0.26,
            },
        });
    } else {
        bind(ApplicationShellOptions).toConstantValue({
            rightPanel: {
                emptySize: CONNECTOME_RIGHT_PANEL_DEFAULT_WIDTH,
                expandThreshold: 140,
                expandDuration: 0,
                initialSizeRatio: 0.26,
            },
        });
    }

    // Product defaults (PreferenceSchemaService overrides — proven path for
    // breadcrumbs; do NOT use applications/desktop theia.frontend.config.preferences
    // for terminal/WYSIWYG — that path failed end-to-end in a prior attempt).
    bind(PreferenceContribution).toConstantValue({
        initSchema: async (service: PreferenceSchemaService) => {
            // Hide path "address bar" under editor tabs (CSS also hides the row).
            service.registerOverride('breadcrumbs.enabled', undefined, false);
            // Windows terminal defaults (full absolute paths required — bare
            // `powershell.exe` fails Theia's exists() check in resolveShellPath).
            // Selectable PowerShell profile is also registered in
            // ConnectomeTerminalContribution (contributed profile store).
            service.registerOverride('terminal.integrated.profiles.windows', undefined, {
                PowerShell: {
                    path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
                    icon: 'terminal-powershell',
                },
                cmd: {
                    path: 'C:\\Windows\\System32\\cmd.exe',
                    icon: 'terminal-cmd',
                },
            });
            service.registerOverride('terminal.integrated.defaultProfile.windows', undefined, 'PowerShell');
        },
    });

    // Save Workspace dialog + isWorkspaceFile: Connectome (*.connectome-workspace) first.
    if (isBound(WorkspaceFileService)) {
        rebind(WorkspaceFileService).to(ConnectomeWorkspaceFileService).inSingletonScope();
    } else {
        bind(WorkspaceFileService).to(ConnectomeWorkspaceFileService).inSingletonScope();
    }

    bind(ConnectomeGettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<ConnectomeGettingStartedWidget>(ConnectomeGettingStartedWidget),
    })).inSingletonScope();
    if (isBound(AboutDialog)) {
        rebind(AboutDialog).to(ConnectomeAboutDialog).inSingletonScope();
    } else {
        bind(AboutDialog).to(ConnectomeAboutDialog).inSingletonScope();
    }

    bind(ConnectomeContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(ConnectomeContribution)
    );

    if (isBound(AIRegistryConfiguration)) {
        rebind(AIRegistryConfiguration).to(ConnectomeAIRegistryConfiguration).inSingletonScope();
    } else {
        bind(AIRegistryConfiguration).to(ConnectomeAIRegistryConfiguration).inSingletonScope();
    }

    bind(ConnectomeThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConnectomeThemeContribution);

    bind(ConnectomeEditorPaddingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConnectomeEditorPaddingContribution);

    // Memory Inspector right-rail icon: force codicon (upstream SVG mask is invisible).
    bind(MemoryInspectorIconContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MemoryInspectorIconContribution);

    bind(RailOrderContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RailOrderContribution);

    // Always open Connectome welcome on start (not Browser / restored main tabs).
    bind(ConnectomeStartupContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConnectomeStartupContribution);

    // Right-rail agent terminal session launchers (Claude / Codex / Antigravity).
    for (const definition of AGENT_DEFINITIONS) {
        bind(WidgetFactory).toDynamicValue(ctx =>
            AgentLauncherWidget.createFactory(ctx.container, definition)
        ).inSingletonScope();
    }
    bind(AgentSessionContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AgentSessionContribution);
    bind(MenuContribution).toService(AgentSessionContribution);
    bind(FrontendApplicationContribution).toService(AgentSessionContribution);

    // Persisted agent session log rail (history of terminal sessions opened above).
    bind(AgentSessionLogService).toSelf().inSingletonScope();
    bind(AgentSessionLogWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: AgentSessionLogWidget.ID,
        createWidget: () => container.get(AgentSessionLogWidget)
    })).inSingletonScope();
    bindViewContribution(bind, AgentSessionLogContribution);
    bind(FrontendApplicationContribution).toService(AgentSessionLogContribution);
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: AGENT_SESSION_LOG_VIEW_CONTAINER_ID,
        createWidget: async () => {
            const viewContainer = container.get<ViewContainer.Factory>(ViewContainer.Factory)({
                id: AGENT_SESSION_LOG_VIEW_CONTAINER_ID
            });
            viewContainer.setTitleOptions(AGENT_SESSION_LOG_VIEW_CONTAINER_TITLE_OPTIONS);
            const widgetManager = container.get(WidgetManager);
            const sessions = await widgetManager.getOrCreateWidget(AgentSessionLogWidget.ID);
            viewContainer.addWidget(sessions, { order: 0, canHide: false, initiallyCollapsed: false });
            return viewContainer;
        }
    })).inSingletonScope();

    // Windows PowerShell as a real selectable + default terminal profile.
    bind(ConnectomeTerminalContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ConnectomeTerminalContribution);

    // JetBrains-style card layout: real Lumino spacing between shell regions.
    rebind(ApplicationShell).to(ConnectomeApplicationShell).inSingletonScope();
    rebind(SidePanelHandler).to(ConnectomeSidePanelHandler);
});

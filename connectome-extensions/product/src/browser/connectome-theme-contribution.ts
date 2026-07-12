/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import connectomeDarkColorThemeJson from './themes/connectome-dark-color-theme.json';

export const CONNECTOME_DARK_THEME_ID = 'connectome-dark';

@injectable()
export class ConnectomeThemeContribution implements FrontendApplicationContribution {

    @inject(MonacoThemingService)
    protected readonly monacoThemingService: MonacoThemingService;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    initialize(): void {
        this.registerAndApplyConnectomeTheme();
    }

    /**
     * MonacoThemingService.restore() loads a previously cached theme snapshot from
     * IndexedDB asynchronously. That can overwrite the freshly registered bundle
     * colors (e.g. activityBar vs shell) after initialize() — a common packaged-app
     * failure mode where yarn-start userData still has a lucky older snapshot.
     * Re-assert on start, after restore has had a chance to run.
     */
    onStart(): void {
        this.registerAndApplyConnectomeTheme(true);
    }

    protected registerAndApplyConnectomeTheme(forceRefresh = false): void {
        this.monacoThemingService.registerParsedTheme({
            id: CONNECTOME_DARK_THEME_ID,
            label: 'Connectome (Dark)',
            uiTheme: 'vs-dark',
            json: connectomeDarkColorThemeJson
        });

        // ThemeService resolves its startup theme (from localStorage/IndexedDB) as soon as it is
        // constructed, which can happen before this contribution's initialize() runs and registers
        // connectome-dark. When that race is lost, ThemeService silently falls back to a built-in
        // Theia theme instead, producing mismatched background colors. Force the intended theme here
        // once registration is guaranteed to have completed, unless the user previously chose a
        // different theme explicitly.
        const lastKnownThemeId = window.localStorage.getItem(ThemeService.STORAGE_KEY);
        if (!lastKnownThemeId || lastKnownThemeId === CONNECTOME_DARK_THEME_ID) {
            if (forceRefresh && this.themeService.getCurrentTheme().id === CONNECTOME_DARK_THEME_ID) {
                // setCurrentTheme is a no-op when the id is already active; bounce via the
                // built-in dark theme so ColorApplicationContribution rewrites CSS variables
                // from the freshly registered color map.
                this.themeService.setCurrentTheme('dark', false);
            }
            this.themeService.setCurrentTheme(CONNECTOME_DARK_THEME_ID, false);
        }
    }
}

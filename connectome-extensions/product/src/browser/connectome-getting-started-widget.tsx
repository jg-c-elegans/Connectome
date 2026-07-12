/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';

import { codicon, Message } from '@theia/core/lib/browser';
import { PreferenceService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';

const DOCUMENTATION_URL = 'https://github.com/jg-c-elegans/connectome#readme';
const REPOSITORY_URL = 'https://github.com/jg-c-elegans/connectome';
const ISSUES_URL = `${REPOSITORY_URL}/issues`;
const RELEASES_URL = `${REPOSITORY_URL}/releases`;
const COMMAND_PALETTE = 'workbench.action.showCommands';
const QUICK_OPEN = 'file-search.openFile';

@injectable()
export class ConnectomeGettingStartedWidget extends GettingStartedWidget {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected readonly recentLimit = 5;

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const firstAction = this.node.querySelector<HTMLElement>('[data-connectome-welcome-primary]');
        firstAction?.focus();
    }

    protected render(): React.ReactNode {
        return <div className='connectome-welcome' data-testid='connectome-welcome'>
            <main className='connectome-welcome__content'>
                {this.renderHero()}
                <div className='connectome-welcome__grid'>
                    <div className='connectome-welcome__column connectome-welcome__column--primary'>
                        {this.renderStartCard()}
                        {this.renderRecentCard()}
                    </div>
                    <div className='connectome-welcome__column connectome-welcome__column--secondary'>
                        {this.renderTipsCard()}
                        {this.renderCustomizeCard()}
                        {this.renderProjectCard()}
                    </div>
                </div>
            </main>
            {this.renderFooter()}
        </div>;
    }

    protected renderHero(): React.ReactNode {
        return <header className='connectome-welcome__hero'>
            <div className='connectome-welcome__logo' role='img' aria-label='Connectome logo' />
            <div>
                <h1>Connectome</h1>
                <p>Think, write, and build.</p>
            </div>
        </header>;
    }

    protected renderStartCard(): React.ReactNode {
        return this.renderCard('Start', 'rocket', <>
            {this.renderAction('New File', 'Create an untitled file', 'new-file', this.doCreateFile, this.doCreateFileEnter, true)}
            {this.renderAction('Open File', 'Choose a file from your computer', 'go-to-file', this.doOpenFile, this.doOpenFileEnter)}
            {this.renderAction('Open Folder', 'Work with the files in a folder', 'folder-opened', this.doOpenFolder, this.doOpenFolderEnter)}
            {this.renderAction('Open Workspace', 'Open a saved workspace', 'window', this.doOpenWorkspace, this.doOpenWorkspaceEnter)}
        </>);
    }

    protected renderRecentCard(): React.ReactNode {
        const paths = this.buildPaths(this.recentWorkspaces);
        const recents = paths.slice(0, this.recentLimit).map((path, index) => {
            const uri = new URI(this.recentWorkspaces[index]);
            return this.renderAction(
                this.labelProvider.getName(uri),
                path,
                'folder',
                () => this.open(uri),
                event => this.openEnter(event, uri),
                false,
                `recent-${index}`
            );
        });

        return this.renderCard('Recent', 'history', <>
            {recents.length > 0 ? recents : <p className='connectome-welcome__empty'>
                No recent folders yet. Open a folder to start working.
            </p>}
            {paths.length > this.recentLimit && this.renderAction(
                'More…', 'Browse all recent workspaces', 'ellipsis', this.doOpenRecentWorkspace, this.doOpenRecentWorkspaceEnter
            )}
        </>);
    }

    protected renderTipsCard(): React.ReactNode {
        return this.renderCard('Quick Tips', 'lightbulb', <>
            {this.renderCommandAction('Command Palette', 'Find and run any command · Ctrl+Shift+P', 'terminal', COMMAND_PALETTE)}
            {this.renderCommandAction('Quick Open', 'Jump to a file by name · Ctrl+P', 'search', QUICK_OPEN)}
            <div className='connectome-welcome__tip' data-testid='markdown-preview-tip'>
                <i className={codicon('preview')} aria-hidden='true' />
                <span><strong>Markdown Preview</strong><small>Open beside your note · Ctrl+K V</small></span>
            </div>
        </>);
    }

    protected renderCustomizeCard(): React.ReactNode {
        return this.renderCard('Customize', 'settings-gear', <>
            {this.renderAction('Settings', 'Adjust Connectome to your workflow', 'settings', this.doOpenPreferences, this.doOpenPreferencesEnter, false, 'settings')}
            {this.renderAction(
                'Keyboard Shortcuts', 'Review or change keybindings', 'keyboard',
                this.doOpenKeyboardShortcuts, this.doOpenKeyboardShortcutsEnter, false, 'keyboard-shortcuts'
            )}
        </>);
    }

    protected renderProjectCard(): React.ReactNode {
        return this.renderCard('Connectome Project', 'github', <>
            {this.renderExternalAction('Documentation', 'Read the project guide', 'book', DOCUMENTATION_URL, 'documentation')}
            {this.renderExternalAction('GitHub Repository', 'Explore the source code', 'github', REPOSITORY_URL, 'repository')}
            {this.renderExternalAction('Report an Issue', 'Share a bug or suggestion', 'issues', ISSUES_URL, 'issues')}
            {this.renderExternalAction('Releases', 'See published versions', 'versions', RELEASES_URL, 'releases')}
        </>);
    }

    protected renderCard(title: string, icon: string, content: React.ReactNode): React.ReactNode {
        const testId = title.toLowerCase().replace(/\s+/g, '-');
        return <section className='connectome-welcome__card' data-testid={`welcome-card-${testId}`}>
            <h2><i className={codicon(icon)} aria-hidden='true' />{title}</h2>
            <div className='connectome-welcome__card-content'>{content}</div>
        </section>;
    }

    protected renderAction(
        label: string,
        detail: string,
        icon: string,
        onClick: () => unknown,
        onKeyDown: (event: React.KeyboardEvent) => void,
        primary = false,
        testId?: string,
        externalUrl?: string
    ): React.ReactNode {
        return <a
            className='connectome-welcome__action'
            role='button'
            tabIndex={0}
            onClick={onClick}
            onKeyDown={onKeyDown}
            data-connectome-welcome-primary={primary || undefined}
            data-testid={testId ? `welcome-action-${testId}` : undefined}
            data-external-url={externalUrl}
        >
            <i className={codicon(icon)} aria-hidden='true' />
            <span><strong>{label}</strong><small>{detail}</small></span>
        </a>;
    }

    protected renderCommandAction(label: string, detail: string, icon: string, command: string): React.ReactNode {
        const execute = () => this.commandRegistry.executeCommand(command);
        return this.renderAction(label, detail, icon, execute, event => this.activateOnKeyboard(event, execute));
    }

    protected renderExternalAction(label: string, detail: string, icon: string, url: string, testId: string): React.ReactNode {
        const open = () => this.doOpenExternalLink(url);
        return this.renderAction(label, detail, icon, open, event => this.activateOnKeyboard(event, open), false, testId, url);
    }

    protected activateOnKeyboard(event: React.KeyboardEvent, action: () => unknown): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            action();
        }
    }

    protected renderFooter(): React.ReactNode {
        return <footer className='connectome-welcome__footer'>
            <div className='connectome-welcome__preference'>{this.renderPreferences()}</div>
            <p data-testid='connectome-version'>
                {this.applicationInfo ? `Connectome ${this.applicationInfo.version}` : 'Connectome'}
            </p>
        </footer>;
    }
}

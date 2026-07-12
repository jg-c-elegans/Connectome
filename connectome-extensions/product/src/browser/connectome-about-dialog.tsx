/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';
import { AboutDialog, AboutDialogProps, ABOUT_CONTENT_CLASS } from '@theia/core/lib/browser/about-dialog';
import { injectable, inject } from '@theia/core/shared/inversify';

const REPOSITORY_URL = 'https://github.com/jg-c-elegans/connectome';
const ISSUES_URL = `${REPOSITORY_URL}/issues`;

@injectable()
export class ConnectomeAboutDialog extends AboutDialog {

    constructor(
        @inject(AboutDialogProps) protected readonly props: AboutDialogProps
    ) {
        super(props);
    }

    protected render(): React.ReactNode {
        return <div className={ABOUT_CONTENT_CLASS}>
            <h2>Connectome</h2>
            <p><strong>Markdown-first desktop workspace built on Eclipse Theia.</strong></p>
            <p>{this.applicationInfo?.version ? `Version ${this.applicationInfo.version}` : 'Windows desktop application'}</p>
            <p>Created by James Grimm at Elegans Labs.</p>
            <p>
                Connectome is open-source software licensed under the MIT License. It is derived from
                Eclipse Theia and preserves the applicable upstream license and attribution.
            </p>
            <p>
                <a role='button' tabIndex={0} onClick={() => this.doOpenExternalLink(REPOSITORY_URL)}
                    onKeyDown={event => this.doOpenExternalLinkEnter(event, REPOSITORY_URL)}>Project repository</a>
                {' · '}
                <a role='button' tabIndex={0} onClick={() => this.doOpenExternalLink(ISSUES_URL)}
                    onKeyDown={event => this.doOpenExternalLinkEnter(event, ISSUES_URL)}>Report an issue</a>
            </p>
        </div>;
    }
}

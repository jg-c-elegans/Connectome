/**
 * Connectome Notes preferences (daily notes folder + template).
 */

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
} from '@theia/core/lib/common/preferences';

export const NOTES_DAILY_FOLDER_PREF = 'connectome.notes.dailyFolder';
export const NOTES_DAILY_TEMPLATE_PREF = 'connectome.notes.dailyTemplate';

export const DEFAULT_DAILY_FOLDER = 'daily_notes';
export const DEFAULT_DAILY_TEMPLATE = '# {{date}}\n\n';

export const NotesPreferenceSchema: PreferenceSchema = {
    properties: {
        [NOTES_DAILY_FOLDER_PREF]: {
            type: 'string',
            default: DEFAULT_DAILY_FOLDER,
            description:
                'Folder under the workspace root for daily notes (YYYY-MM-DD.md). ' +
                'Use an empty string to store dailies at the workspace root. Default: daily_notes.',
        },
        [NOTES_DAILY_TEMPLATE_PREF]: {
            type: 'string',
            default: DEFAULT_DAILY_TEMPLATE,
            description:
                'Markdown body used when creating a new daily note. ' +
                'Variables: {{date}}, {{title}}, {{clipboard}}, {{year}}, {{month}}, {{day}}, {{weekday}}. ' +
                'Applied only on create — existing dailies are never overwritten.',
        },
    },
};

export interface NotesConfiguration {
    [NOTES_DAILY_FOLDER_PREF]: string;
    [NOTES_DAILY_TEMPLATE_PREF]: string;
}

export const NotesPreferenceContribution = Symbol('NotesPreferenceContribution');
export const NotesPreferences = Symbol('NotesPreferences');
export type NotesPreferences = PreferenceProxy<NotesConfiguration>;

export function createNotesPreferences(
    preferences: PreferenceService,
    schema: PreferenceSchema = NotesPreferenceSchema,
): NotesPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindNotesPreferences(bind: interfaces.Bind): void {
    bind(NotesPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(NotesPreferenceContribution);
        return createNotesPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(NotesPreferenceContribution).toConstantValue({ schema: NotesPreferenceSchema });
    bind(PreferenceContribution).toService(NotesPreferenceContribution);
}

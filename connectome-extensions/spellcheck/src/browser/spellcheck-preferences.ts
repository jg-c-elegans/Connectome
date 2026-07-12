/**
 * Connectome Spellcheck preferences.
 */

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
} from '@theia/core/lib/common/preferences';

export const SPELLCHECK_ENABLED_PREF = 'connectome.spellcheck.enabled';

export const DEFAULT_SPELLCHECK_ENABLED = true;

export const SpellcheckPreferenceSchema: PreferenceSchema = {
    properties: {
        [SPELLCHECK_ENABLED_PREF]: {
            type: 'boolean',
            default: DEFAULT_SPELLCHECK_ENABLED,
            description: 'Enable spell-checking of markdown notes. Toggling this is equivalent to ' +
                'the "Spell Check: Toggle" command.',
        },
    },
};

export interface SpellcheckConfiguration {
    [SPELLCHECK_ENABLED_PREF]: boolean;
}

export const SpellcheckPreferenceContribution = Symbol('SpellcheckPreferenceContribution');
export const SpellcheckPreferences = Symbol('SpellcheckPreferences');
export type SpellcheckPreferences = PreferenceProxy<SpellcheckConfiguration>;

export function createSpellcheckPreferences(
    preferences: PreferenceService,
    schema: PreferenceSchema = SpellcheckPreferenceSchema,
): SpellcheckPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindSpellcheckPreferences(bind: interfaces.Bind): void {
    bind(SpellcheckPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(SpellcheckPreferenceContribution);
        return createSpellcheckPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(SpellcheckPreferenceContribution).toConstantValue({ schema: SpellcheckPreferenceSchema });
    bind(PreferenceContribution).toService(SpellcheckPreferenceContribution);
}

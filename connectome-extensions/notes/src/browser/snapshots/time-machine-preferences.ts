/**
 * Connectome Time Machine preferences (workspace snapshot exclusions).
 */

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceService,
} from '@theia/core/lib/common/preferences';

export const TIME_MACHINE_EXCLUDE_GLOBS_PREF = 'connectome.timeMachine.excludeGlobs';

export const DEFAULT_TIME_MACHINE_EXCLUDE_GLOBS: string[] = [
    '**/.git/**',
    '**/node_modules/**',
    '**/.connectome-snapshots/**',
    '**/dist/**',
    '**/lib/**',
    '**/out/**',
    '**/build/**',
    '**/.cache/**',
];

export const TimeMachinePreferenceSchema: PreferenceSchema = {
    properties: {
        [TIME_MACHINE_EXCLUDE_GLOBS_PREF]: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_TIME_MACHINE_EXCLUDE_GLOBS,
            description:
                'Glob patterns (relative to the workspace root) for files that should never be snapshotted ' +
                'by Time Machine. Supports "*" and "**" wildcards.',
        },
    },
};

export interface TimeMachineConfiguration {
    [TIME_MACHINE_EXCLUDE_GLOBS_PREF]: string[];
}

export const TimeMachinePreferenceContribution = Symbol('TimeMachinePreferenceContribution');
export const TimeMachinePreferences = Symbol('TimeMachinePreferences');
export type TimeMachinePreferences = PreferenceProxy<TimeMachineConfiguration>;

export function createTimeMachinePreferences(
    preferences: PreferenceService,
    schema: PreferenceSchema = TimeMachinePreferenceSchema,
): TimeMachinePreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindTimeMachinePreferences(bind: interfaces.Bind): void {
    bind(TimeMachinePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(TimeMachinePreferenceContribution);
        return createTimeMachinePreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(TimeMachinePreferenceContribution).toConstantValue({ schema: TimeMachinePreferenceSchema });
    bind(PreferenceContribution).toService(TimeMachinePreferenceContribution);
}

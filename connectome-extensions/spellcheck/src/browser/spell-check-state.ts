import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { SpellcheckPreferences, SPELLCHECK_ENABLED_PREF, DEFAULT_SPELLCHECK_ENABLED } from './spellcheck-preferences';

const STORAGE_KEY = 'connectome.spellCheckEnabled';

/**
 * Global (not per-workspace) on/off state for spell-checking.
 *
 * Source of truth is now the `connectome.spellcheck.enabled` preference (so it
 * shows up in Theia's Settings UI, grouped under "Connectome"), with the legacy
 * StorageService key kept as a one-time migration source and still written on
 * every change so any code still reading it directly keeps working.
 */
@injectable()
export class SpellCheckStateService {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(SpellcheckPreferences)
    protected readonly preferences: SpellcheckPreferences;

    protected _enabled = DEFAULT_SPELLCHECK_ENABLED;

    protected readonly onDidChangeEmitter = new Emitter<boolean>();
    readonly onDidChange: Event<boolean> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.reload().catch(() => { /* ignore */ });
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === SPELLCHECK_ENABLED_PREF) {
                const newValue = this.preferences[SPELLCHECK_ENABLED_PREF];
                if (this._enabled !== newValue) {
                    this._enabled = !!newValue;
                    this.onDidChangeEmitter.fire(this._enabled);
                }
            }
        });
    }

    protected async reload(): Promise<void> {
        const hasPreferenceOverride = this.preferenceService.inspect<boolean>(SPELLCHECK_ENABLED_PREF)?.value !== undefined;
        if (!hasPreferenceOverride) {
            // Migrate a pre-preferences StorageService value once, if present.
            const legacy = await this.storage.getData<boolean>(STORAGE_KEY, DEFAULT_SPELLCHECK_ENABLED);
            if (legacy !== DEFAULT_SPELLCHECK_ENABLED) {
                await this.preferenceService.set(SPELLCHECK_ENABLED_PREF, legacy);
            }
        }
        this._enabled = this.preferences[SPELLCHECK_ENABLED_PREF];
        this.onDidChangeEmitter.fire(this._enabled);
    }

    get enabled(): boolean {
        return this._enabled;
    }

    async setEnabled(value: boolean): Promise<void> {
        if (this._enabled === value) {
            return;
        }
        this._enabled = value;
        await this.preferenceService.set(SPELLCHECK_ENABLED_PREF, value);
        await this.storage.setData(STORAGE_KEY, value);
        this.onDidChangeEmitter.fire(this._enabled);
    }

    async toggle(): Promise<boolean> {
        await this.setEnabled(!this._enabled);
        return this._enabled;
    }
}

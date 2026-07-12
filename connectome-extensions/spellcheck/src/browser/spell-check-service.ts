import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import nspellModule, { NSpell } from 'nspell';
// Vendored en_US Hunspell dictionary (see DICTIONARY-LICENSE.txt). Source-tree-relative
// import so webpack resolves the same file from compiled lib/ (same depth as src/).
import dictionaryData from '../../src/browser/dictionary/en-us-dictionary.json';

const DICTIONARY_DIR = '.connectome';
const DICTIONARY_FILE = 'dictionary.json';

/** nspell is CJS; webpack/esModuleInterop may surface either form. */
function createNspell(aff: string, dic: string): NSpell {
    const factory = (typeof nspellModule === 'function'
        ? nspellModule
        : (nspellModule as unknown as { default: typeof nspellModule }).default) as typeof nspellModule;
    if (typeof factory !== 'function') {
        throw new Error('nspell factory is not a function after module load');
    }
    return factory({ aff, dic });
}

function readDictionaryPayload(data: unknown): { aff: string; dic: string } {
    const root = data as { aff?: string; dic?: string; default?: { aff?: string; dic?: string } };
    const aff = root?.aff ?? root?.default?.aff;
    const dic = root?.dic ?? root?.default?.dic;
    if (typeof aff !== 'string' || typeof dic !== 'string' || aff.length < 8 || dic.length < 8) {
        throw new Error('en-us-dictionary.json missing aff/dic strings after bundling');
    }
    return { aff, dic };
}

/**
 * Owns the nspell (Hunspell en_US) instance, the per-workspace custom
 * dictionary file, and a session-only ignore list.
 *
 * IMPORTANT: dictionary init must run in @postConstruct, not a field initializer.
 * Field initializers run before Inversify @inject properties are set; loading the
 * custom dictionary then threw and the outer catch wiped a successful nspell load,
 * leaving isReady permanently false (no markers, no code actions).
 */
@injectable()
export class SpellCheckService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected spell: NSpell | undefined;
    protected initError: string | undefined;
    protected readonly customWords = new Set<string>();
    protected readonly ignoredWords = new Set<string>();
    protected dictionaryUri: URI | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readyResolve: (() => void) | undefined;
    protected readonly readyPromise: Promise<void> = new Promise(resolve => {
        this.readyResolve = resolve;
    });

    get ready(): Promise<void> {
        return this.readyPromise;
    }

    get isReady(): boolean {
        return !!this.spell && !this.initError;
    }

    get lastError(): string | undefined {
        return this.initError;
    }

    @postConstruct()
    protected init(): void {
        void this.initialize().finally(() => {
            this.readyResolve?.();
            this.readyResolve = undefined;
        });
    }

    protected async initialize(): Promise<void> {
        try {
            const { aff, dic } = readDictionaryPayload(dictionaryData);
            this.spell = createNspell(aff, dic);
            if (this.spell.correct('hello') !== true || this.spell.correct('xyzzyabc') !== false) {
                throw new Error('nspell dictionary sanity check failed');
            }
            this.initError = undefined;
            console.info('[connectome-spellcheck] dictionary ready');
        } catch (err) {
            this.spell = undefined;
            this.initError = err instanceof Error ? err.message : String(err);
            console.error('[connectome-spellcheck] failed to initialize dictionary:', err);
            return;
        }
        // Optional workspace word list — must not undo a successful base load.
        try {
            await this.loadCustomDictionary();
        } catch (err) {
            console.warn('[connectome-spellcheck] custom dictionary load skipped:', err);
        }
    }

    protected async loadCustomDictionary(): Promise<void> {
        const uri = await this.resolveDictionaryUri();
        if (!uri || !this.spell) {
            return;
        }
        try {
            const { value } = await this.fileService.read(uri);
            const parsed: unknown = JSON.parse(value);
            if (Array.isArray(parsed)) {
                for (const word of parsed) {
                    if (typeof word === 'string' && word) {
                        this.customWords.add(word);
                        this.spell.add(word);
                    }
                }
            }
        } catch {
            // No custom dictionary yet, or unreadable — treat as empty.
        }
    }

    protected async resolveDictionaryUri(): Promise<URI | undefined> {
        if (this.dictionaryUri) {
            return this.dictionaryUri;
        }
        const roots = await this.workspaceService.roots;
        if (roots.length === 0) {
            return undefined;
        }
        this.dictionaryUri = roots[0].resource.resolve(DICTIONARY_DIR).resolve(DICTIONARY_FILE);
        return this.dictionaryUri;
    }

    /** Synchronous once `ready` has resolved; treats unloaded state as "correct". */
    checkSync(word: string): boolean {
        if (this.ignoredWords.has(word.toLowerCase())) {
            return true;
        }
        if (!this.spell) {
            return true;
        }
        return this.spell.correct(word);
    }

    suggestSync(word: string, limit = 5): string[] {
        if (!this.spell) {
            return [];
        }
        return this.spell.suggest(word).slice(0, limit);
    }

    ignoreWord(word: string): void {
        const key = word.toLowerCase();
        if (this.ignoredWords.has(key)) {
            return;
        }
        this.ignoredWords.add(key);
        this.onDidChangeEmitter.fire();
    }

    async addToDictionary(word: string): Promise<void> {
        if (this.customWords.has(word)) {
            return;
        }
        this.customWords.add(word);
        this.spell?.add(word);
        await this.persistCustomDictionary();
        this.onDidChangeEmitter.fire();
    }

    protected async persistCustomDictionary(): Promise<void> {
        const uri = await this.resolveDictionaryUri();
        if (!uri) {
            return;
        }
        const content = JSON.stringify([...this.customWords].sort(), undefined, 2);
        await this.fileService.write(uri, content);
    }
}

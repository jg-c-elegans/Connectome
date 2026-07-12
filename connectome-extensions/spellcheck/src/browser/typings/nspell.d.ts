declare module 'nspell' {
    interface NSpellDictionary {
        aff: Buffer | string;
        dic: Buffer | string;
    }

    interface NSpell {
        correct(word: string): boolean;
        suggest(word: string): string[];
        add(word: string, model?: string): NSpell;
        remove(word: string): NSpell;
    }

    function nspell(
        dictionary: NSpellDictionary | Buffer | string,
        ...rest: Array<NSpellDictionary | Buffer | string>
    ): NSpell;

    export default nspell;
    export { NSpell, NSpellDictionary };
}

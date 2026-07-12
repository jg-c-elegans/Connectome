import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { SpellCheckService } from './spell-check-service';
import { SpellCheckStateService } from './spell-check-state';
import { SpellCheckDiagnosticsContribution } from './spell-check-diagnostics-contribution';
import { SpellCheckCommandContribution } from './spell-check-command-contribution';
import { SpellCheckCodeActionProvider } from './spell-check-code-action-provider';
import { bindSpellcheckPreferences } from './spellcheck-preferences';

export default new ContainerModule(bind => {
    bindSpellcheckPreferences(bind);

    bind(SpellCheckService).toSelf().inSingletonScope();
    bind(SpellCheckStateService).toSelf().inSingletonScope();

    bind(SpellCheckDiagnosticsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SpellCheckDiagnosticsContribution);

    bind(SpellCheckCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SpellCheckCommandContribution);
    bind(MenuContribution).toService(SpellCheckCommandContribution);

    bind(SpellCheckCodeActionProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SpellCheckCodeActionProvider);
    bind(MenuContribution).toService(SpellCheckCodeActionProvider);

});

import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { ExportElectronMain } from './export-electron-main';

export default new ContainerModule(bind => {
    bind(ExportElectronMain).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(ExportElectronMain);
});

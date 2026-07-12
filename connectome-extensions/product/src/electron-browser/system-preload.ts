import { contextBridge, ipcRenderer } from '@theia/core/electron-shared/electron';
import {
    ConnectomeSystemAPI,
    SYSTEM_GET_FILE_ICON,
    SYSTEM_GIT_STATUS,
    SYSTEM_INFO,
    SYSTEM_LAUNCH_APP,
    SYSTEM_PERF,
    SYSTEM_PICK_FILE
} from '../common/system-api';

const api: ConnectomeSystemAPI = {
    getGitStatus: workspaceRoot => ipcRenderer.invoke(SYSTEM_GIT_STATUS, workspaceRoot),
    getSystemInfo: () => ipcRenderer.invoke(SYSTEM_INFO),
    getSystemPerf: () => ipcRenderer.invoke(SYSTEM_PERF),
    launchApp: exePath => ipcRenderer.invoke(SYSTEM_LAUNCH_APP, exePath),
    pickExecutable: () => ipcRenderer.invoke(SYSTEM_PICK_FILE, 'executable'),
    getFileIcon: exePath => ipcRenderer.invoke(SYSTEM_GET_FILE_ICON, exePath)
};

export function preload(): void { contextBridge.exposeInMainWorld('electronConnectomeSystem', api); }

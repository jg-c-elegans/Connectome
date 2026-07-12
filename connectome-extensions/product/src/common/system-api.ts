export const SYSTEM_GIT_STATUS = 'connectomeSystem:gitStatus';
export const SYSTEM_INFO = 'connectomeSystem:info';
export const SYSTEM_PERF = 'connectomeSystem:perf';
export const SYSTEM_LAUNCH_APP = 'connectomeSystem:launchApp';
export const SYSTEM_PICK_FILE = 'connectomeSystem:pickFile';
export const SYSTEM_GET_FILE_ICON = 'connectomeSystem:getFileIcon';

export interface GitStatusResult {
    isRepo: boolean;
    branch?: string;
    changedFiles?: number;
    recentCommits?: { hash: string; message: string }[];
    error?: string;
}

export interface SystemInfo {
    platform: string;
    arch: string;
    hostname: string;
    osVersion: string;
    uptimeSeconds: number;
    cpuModel: string;
    cpuCores: number;
    totalMemGB: number;
    freeMemGB: number;
    nodeVersion: string;
    electronVersion: string;
    chromeVersion: string;
    homeDir: string;
}

export interface SystemPerf {
    cpuPercent: number;
    ramPercent: number;
    diskPercent?: number;
    batteryPercent?: number;
    batteryCharging?: boolean;
}

export interface ConnectomeSystemAPI {
    getGitStatus(workspaceRoot: string): Promise<GitStatusResult>;
    getSystemInfo(): Promise<SystemInfo>;
    getSystemPerf(): Promise<SystemPerf>;
    launchApp(exePath: string): Promise<void>;
    pickExecutable(): Promise<string | undefined>;
    /** Reads the executable's own icon (Electron's `app.getFileIcon`) as a data URI. */
    getFileIcon(exePath: string): Promise<string | undefined>;
}

declare global { interface Window { electronConnectomeSystem?: ConnectomeSystemAPI } }

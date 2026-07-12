/**
 * Ambient shape of the `electronConnectomeSystem` bridge exposed by connectome-product-ext's
 * preload (src/electron-main/system-electron-main.ts + src/electron-browser/system-preload.ts).
 * Declared locally (not imported) so this extension has no compile-time dependency on
 * connectome-product-ext — mirrors how connectome-scripts-ext/connectome-clipboard-ext talk to
 * sibling extensions via commands/events instead of imports.
 */
interface ConnectomeSystemGitStatus {
    isRepo: boolean;
    branch?: string;
    changedFiles?: number;
    recentCommits?: { hash: string; message: string }[];
    error?: string;
}

interface ConnectomeSystemInfo {
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

interface ConnectomeSystemPerf {
    cpuPercent: number;
    ramPercent: number;
    diskPercent?: number;
    batteryPercent?: number;
    batteryCharging?: boolean;
}

interface ConnectomeSystemBridge {
    getGitStatus(workspaceRoot: string): Promise<ConnectomeSystemGitStatus>;
    getSystemInfo(): Promise<ConnectomeSystemInfo>;
    getSystemPerf(): Promise<ConnectomeSystemPerf>;
    launchApp(exePath: string): Promise<void>;
    pickExecutable(): Promise<string | undefined>;
    getFileIcon(exePath: string): Promise<string | undefined>;
}

declare global {
    interface Window {
        electronConnectomeSystem?: ConnectomeSystemBridge;
    }
}

export { };

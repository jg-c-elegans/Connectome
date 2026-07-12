import { injectable } from '@theia/core/shared/inversify';
import {
    ElectronMainApplication,
    ElectronMainApplicationContribution
} from '@theia/core/lib/electron-main/electron-main-application';
import { app, BrowserWindow, dialog, ipcMain, shell } from '@theia/core/electron-shared/electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import {
    GitStatusResult,
    SYSTEM_GET_FILE_ICON,
    SYSTEM_GIT_STATUS,
    SYSTEM_INFO,
    SYSTEM_LAUNCH_APP,
    SYSTEM_PERF,
    SYSTEM_PICK_FILE,
    SystemInfo,
    SystemPerf
} from '../common/system-api';

const execFileAsync = promisify(execFile);
const POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function cpuSnapshot(): { idle: number; total: number } {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        idle += cpu.times.idle;
        total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }
    return { idle, total };
}

@injectable()
export class SystemElectronMain implements ElectronMainApplicationContribution {

    onStart(_application: ElectronMainApplication): void {
        ipcMain.handle(SYSTEM_GIT_STATUS, (_event, workspaceRoot: string) => this.getGitStatus(workspaceRoot));
        ipcMain.handle(SYSTEM_INFO, () => this.getSystemInfo());
        ipcMain.handle(SYSTEM_PERF, () => this.getSystemPerf());
        ipcMain.handle(SYSTEM_LAUNCH_APP, (_event, exePath: string) => shell.openPath(exePath));
        ipcMain.handle(SYSTEM_PICK_FILE, (event, kind: 'executable') => this.pickFile(event, kind));
        ipcMain.handle(SYSTEM_GET_FILE_ICON, (_event, exePath: string) => this.getFileIcon(exePath));
    }

    protected async getGitStatus(workspaceRoot: string): Promise<GitStatusResult> {
        if (!workspaceRoot) {
            return { isRepo: false };
        }
        try {
            await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: workspaceRoot });
        } catch {
            return { isRepo: false };
        }
        try {
            const [statusResult, branchResult, logResult] = await Promise.all([
                execFileAsync('git', ['status', '--porcelain'], { cwd: workspaceRoot }),
                execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceRoot }),
                execFileAsync('git', ['log', '-5', '--pretty=%h%x09%s'], { cwd: workspaceRoot })
            ]);
            const changedFiles = statusResult.stdout.split('\n').filter(l => l.trim().length > 0).length;
            const branch = branchResult.stdout.trim();
            const recentCommits = logResult.stdout.split('\n')
                .filter(l => l.trim().length > 0)
                .map(line => {
                    const [hash, ...rest] = line.split('\t');
                    return { hash, message: rest.join('\t') };
                });
            return { isRepo: true, branch, changedFiles, recentCommits };
        } catch (err) {
            return { isRepo: true, error: err instanceof Error ? err.message : String(err) };
        }
    }

    protected async getSystemInfo(): Promise<SystemInfo> {
        const cpus = os.cpus();
        return {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            osVersion: (os.version?.() ?? os.release()),
            uptimeSeconds: os.uptime(),
            cpuModel: cpus[0]?.model?.trim() ?? 'Unknown CPU',
            cpuCores: cpus.length,
            totalMemGB: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
            freeMemGB: Math.round((os.freemem() / (1024 ** 3)) * 10) / 10,
            nodeVersion: process.versions.node ?? 'unknown',
            electronVersion: process.versions.electron ?? 'unknown',
            chromeVersion: process.versions.chrome ?? 'unknown',
            homeDir: os.homedir()
        };
    }

    protected async getSystemPerf(): Promise<SystemPerf> {
        const before = cpuSnapshot();
        await new Promise(resolve => setTimeout(resolve, 150));
        const after = cpuSnapshot();
        const idleDelta = after.idle - before.idle;
        const totalDelta = after.total - before.total;
        const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
        const ramPercent = Math.round((1 - os.freemem() / os.totalmem()) * 100);

        let diskPercent: number | undefined;
        let batteryPercent: number | undefined;
        let batteryCharging: boolean | undefined;
        if (os.platform() === 'win32') {
            try {
                const { stdout } = await execFileAsync(POWERSHELL_PATH, [
                    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
                    "$d = Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"; " +
                    '$b = Get-CimInstance Win32_Battery | Select-Object -First 1; ' +
                    '[pscustomobject]@{ diskUsedPct = if ($d) { [math]::Round((($d.Size - $d.FreeSpace) / $d.Size) * 100) } else { $null }; ' +
                    'batteryPct = if ($b) { $b.EstimatedChargeRemaining } else { $null }; ' +
                    'charging = if ($b) { $b.BatteryStatus -eq 2 } else { $null } } | ConvertTo-Json -Compress'
                ], { timeout: 5000 });
                const parsed = JSON.parse(stdout.trim());
                diskPercent = typeof parsed.diskUsedPct === 'number' ? parsed.diskUsedPct : undefined;
                batteryPercent = typeof parsed.batteryPct === 'number' ? parsed.batteryPct : undefined;
                batteryCharging = typeof parsed.charging === 'boolean' ? parsed.charging : undefined;
            } catch {
                // best-effort only
            }
        }

        return { cpuPercent, ramPercent, diskPercent, batteryPercent, batteryCharging };
    }

    protected async pickFile(event: Electron.IpcMainInvokeEvent, kind: 'executable'): Promise<string | undefined> {
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const filters = kind === 'executable' ? [{ name: 'Executables', extensions: ['exe'] }] : [];
        const result = window
            ? await dialog.showOpenDialog(window, { properties: ['openFile'], filters })
            : await dialog.showOpenDialog({ properties: ['openFile'], filters });
        return result.canceled ? undefined : result.filePaths[0];
    }

    protected async getFileIcon(exePath: string): Promise<string | undefined> {
        try {
            const icon = await app.getFileIcon(exePath, { size: 'normal' });
            return icon.isEmpty() ? undefined : icon.toDataURL();
        } catch {
            return undefined;
        }
    }
}

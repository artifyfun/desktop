import { autoUpdater } from 'electron-updater';
import { app, dialog, ipcMain } from 'electron';
import log from 'electron-log/main';

import { IPC_CHANNELS } from '../constants';
import { useComfySettings } from '../config/comfySettings';

export class UpdaterService {
  private isInitialized = false;
  private updateCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupAutoUpdater();
    this.registerIPCHandlers();
  }

  private setupAutoUpdater(): void {
    // 配置日志
    autoUpdater.logger = log;

    // 设置更新服务器URL
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://github.com/artifyfun/desktop/releases/latest',
      channel: 'latest',
    });

    // 事件监听器
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendUpdateStatus('checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.sendUpdateStatus('available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendUpdateStatus('not-available', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('AutoUpdater error:', err);
      this.sendUpdateStatus('error', { error: err.message });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
      this.sendUpdateStatus('downloading', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.sendUpdateStatus('downloaded', info);
      this.showUpdateReadyDialog();
    });

    // 禁用自动下载，让用户选择是否下载
    autoUpdater.autoDownload = false;
  }

  private sendUpdateStatus(status: string, data?: any): void {
    // 这里可以通过IPC发送状态到渲染进程
    // 如果需要的话，可以添加相应的IPC通道
    log.info(`Update status: ${status}`, data);
  }

  private async showUpdateReadyDialog(): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of ComfyUI is ready to install.',
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  }

  private registerIPCHandlers(): void {
    // 检查更新
    ipcMain.handle(
      IPC_CHANNELS.CHECK_FOR_UPDATES,
      async (): Promise<{ isUpdateAvailable: boolean; version?: string }> => {
        log.info('Manually checking for updates');
        
        try {
          const result = await autoUpdater.checkForUpdates();
          return {
            isUpdateAvailable: !!result,
            version: result?.updateInfo?.version,
          };
        } catch (error) {
          log.error('Failed to check for updates:', error);
          throw new Error(`Failed to check for updates: ${error}`);
        }
      }
    );

    // 下载更新
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
      log.info('Starting update download');
      
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        log.error('Failed to download update:', error);
        throw new Error(`Failed to download update: ${error}`);
      }
    });

    // 重启并安装更新
    ipcMain.handle(IPC_CHANNELS.RESTART_AND_INSTALL, () => {
      log.info('Restarting and installing update');
      
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        log.error('Failed to restart and install update:', error);
        throw new Error(`Failed to restart and install update: ${error}`);
      }
    });
  }

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    log.info('Initializing UpdaterService');
    
    // 检查是否启用自动更新
    const autoUpdateEnabled = useComfySettings().get('Comfy-Desktop.AutoUpdate');
    
    if (autoUpdateEnabled) {
      // 设置定时检查更新（每小时检查一次）
      this.updateCheckInterval = setInterval(() => {
        this.checkForUpdates();
      }, 60 * 60 * 1000);

      // 应用启动后延迟检查更新
      setTimeout(() => {
        this.checkForUpdates();
      }, 5000);
    }

    this.isInitialized = true;
  }

  public async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Auto update check failed:', error);
    }
  }

  public async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('Update download failed:', error);
      throw error;
    }
  }

  public quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  public dispose(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }
} 
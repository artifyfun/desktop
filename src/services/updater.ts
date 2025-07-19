import { autoUpdater } from 'electron-updater';
import { app, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log/main';

import { IPC_CHANNELS } from '../constants';
import { useComfySettings } from '../config/comfySettings';

export class UpdaterService {
  private isInitialized = false;
  private updateCheckInterval: NodeJS.Timeout | null = null;
  private static instance: UpdaterService | null = null;

  constructor() {
    this.setupAutoUpdater();
    this.registerIPCHandlers();
  }

  // 单例模式
  public static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService();
    }
    return UpdaterService.instance;
  }

  private setupAutoUpdater(): void {
    // 配置日志
    autoUpdater.logger = log;

    // 设置更新服务器URL - 修复GitHub配置
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'artifyfun',
      repo: 'desktop',
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
      // 注释掉自动显示更新可用对话框，由前端处理
      // this.showUpdateAvailableDialog(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.sendUpdateStatus('not-available', info);
    });

    autoUpdater.on('error', (err) => {
      log.error('AutoUpdater error:', err);
      this.sendUpdateStatus('error', { error: err.message });
      
      // 检查是否是代码签名错误
      if (err.message.includes('Code signature') || err.message.includes('代码不含资源')) {
        this.showCodeSignatureErrorDialog(err);
      } else {
        this.showUpdateErrorDialog(err);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      log.info('Download progress:', progressObj);
      this.sendUpdateStatus('downloading', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.sendUpdateStatus('downloaded', info);
      // 注释掉自动显示更新就绪对话框，由前端处理
      // this.showUpdateReadyDialog();
    });

    // 禁用自动下载，让用户选择是否下载
    autoUpdater.autoDownload = false;
  }

  private sendUpdateStatus(status: string, data?: any): void {
    // 这里可以通过IPC发送状态到渲染进程
    // 如果需要的话，可以添加相应的IPC通道
    log.info(`Update status: ${status}`, data);
  }

  // 注释掉更新可用对话框，由前端处理
  /*
  private async showUpdateAvailableDialog(info: any): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available.`,
      detail: `Current version: ${app.getVersion()}\nNew version: ${info.version}\n\nWould you like to download and install this update?`,
      buttons: ['Download Update', 'Later'],
      defaultId: 0,
    });

    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        log.error('Failed to start download:', error);
        this.showUpdateErrorDialog(error as Error);
      }
    }
  }
  */

  // 注释掉更新就绪对话框，由前端处理
  /*
  private async showUpdateReadyDialog(): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of Artify is ready to install.',
      detail: 'The application will restart to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    });

    if (response === 0) {
      this.quitAndInstall();
    }
  }
  */

  private async showUpdateErrorDialog(error: Error): Promise<void> {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Update Error',
      message: 'Failed to check for updates.',
      detail: `Error: ${error.message}\n\nPlease try again later or check your internet connection.`,
      buttons: ['OK'],
    });
  }

  private async showCodeSignatureErrorDialog(error: Error): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Code Signature Error',
      message: 'Update installation failed due to code signature validation.',
      detail: `Error: ${error.message}\n\nThis is a known issue with macOS code signing. You can:\n\n1. Download and install the update manually from GitHub\n2. Disable Gatekeeper temporarily\n3. Contact support for assistance`,
      buttons: ['Download Manually', 'Ignore', 'Contact Support'],
      defaultId: 0,
    });

    if (response === 0) {
      // 打开GitHub发布页面
      await shell.openExternal('https://github.com/artifyfun/desktop/releases');
    } else if (response === 2) {
      // 打开支持页面
      await shell.openExternal('https://github.com/artifyfun/desktop/issues');
    }
  }

  private registerIPCHandlers(): void {
    // 检查更新
    ipcMain.handle(
      IPC_CHANNELS.CHECK_FOR_UPDATES,
      async (): Promise<{ isUpdateAvailable: boolean; version?: string; error?: string }> => {
        log.info('Manually checking for updates');
        
        try {
          const result = await autoUpdater.checkForUpdates();
          const isUpdateAvailable = !!result;
          const version = result?.updateInfo?.version;
          
          log.info(`Update check result: available=${isUpdateAvailable}, version=${version}`);
          
          return {
            isUpdateAvailable,
            version,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error('Failed to check for updates:', error);
          return {
            isUpdateAvailable: false,
            error: errorMessage,
          };
        }
      }
    );

    // 下载更新
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
      log.info('Starting update download');
      
      try {
        await autoUpdater.downloadUpdate();
        log.info('Update download completed successfully');
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Failed to download update:', error);
        return { 
          success: false, 
          error: errorMessage 
        };
      }
    });

    // 重启并安装更新
    ipcMain.handle(IPC_CHANNELS.RESTART_AND_INSTALL, async () => {
      log.info('Restarting and installing update');
      
      try {
        // 检查是否有下载好的更新 - 使用公共API检查
        try {
          // 尝试获取更新信息来检查是否有下载好的更新
          const updateInfo = await autoUpdater.checkForUpdates();
          if (!updateInfo) {
            log.warn('No downloaded update available for installation');
            return { 
              success: false, 
              error: 'No downloaded update available. Please download the update first.' 
            };
          }
        } catch (error) {
          log.warn('Error checking for downloaded update:', error);
          return { 
            success: false, 
            error: 'Unable to verify update status. Please try downloading the update first.' 
          };
        }

        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('Failed to restart and install update:', error);
        return { 
          success: false, 
          error: errorMessage 
        };
      }
    });
  }

  public initialize(): void {
    if (this.isInitialized) {
      log.info('UpdaterService already initialized');
      return;
    }

    log.info('Initializing UpdaterService');
    
    // 注释掉自动更新检查，由前端提供检测界面
    /*
    // 检查是否启用自动更新
    const autoUpdateEnabled = useComfySettings().get('Comfy-Desktop.AutoUpdate');
    log.info(`Auto update enabled: ${autoUpdateEnabled}`);
    
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
    */

    this.isInitialized = true;
    log.info('UpdaterService initialization completed');
  }

  public async checkForUpdates(): Promise<void> {
    try {
      log.info('Checking for updates...');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error('Auto update check failed:', error);
    }
  }

  public async downloadUpdate(): Promise<void> {
    try {
      log.info('Starting update download...');
      await autoUpdater.downloadUpdate();
      log.info('Update download completed');
    } catch (error) {
      log.error('Update download failed:', error);
      throw error;
    }
  }

  public quitAndInstall(): void {
    log.info('Quitting and installing update...');
    autoUpdater.quitAndInstall();
  }

  public dispose(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    log.info('UpdaterService disposed');
  }
} 
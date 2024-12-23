import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import log from 'electron-log/main';
import path from 'node:path';
import { ComfyInstallation, ValidationResult } from '../main-process/comfyInstallation';
import type { AppWindow } from '../main-process/appWindow';
import { useDesktopConfig } from '../store/desktopConfig';
import type { InstallOptions } from '../preload';
import { IPC_CHANNELS } from '../constants';
import { InstallWizard } from './installWizard';
import { validateHardware } from '../utils';

/** High-level / UI handling of installation validation. */
export class InstallationValidator {
  constructor(public readonly appWindow: AppWindow) {}

  /**
   * Ensures that ComfyUI is installed and ready to run.
   *
   * First checks for an existing installation and validates it. If missing or invalid, a fresh install is started.
   * @returns A valid {@link ComfyInstallation} object.
   */
  async ensureInstalled(): Promise<ComfyInstallation> {
    const installation = await this.getInstallation();

    if (!installation || installation.state === 'started') return await this.freshInstall();
    return installation;
  }

  /**
   * Gets the current installation state, confirming any details saved in config.
   * @returns A valid {@link ComfyInstallation} object if the installation passes validation, otherwise `undefined`.
   */
  async getInstallation(): Promise<ComfyInstallation | undefined> {
    const installation = ComfyInstallation.fromConfig();

    // Fresh install
    if (!installation) return undefined;

    const validation = await installation.validate();
    // TODO: Resume install at point of interruption
    if (validation.state === 'started') return installation;
    if (validation.state === 'upgraded') installation.upgradeConfig();

    // Fix any issues before attempting app start
    if (validation.issues.length > 0) {
      await this.resolveIssues(installation, validation);
      await installation.validate();
    }

    // TODO: Confirm this is no longer possible after resolveIssues, and remove.
    if (!installation.basePath) throw new Error('Base path was invalid after installation validation.');
    return installation;
  }

  /**
   * Install ComfyUI and return the base path.
   */
  async freshInstall(): Promise<ComfyInstallation> {
    log.info('Starting installation.');

    const config = useDesktopConfig();
    config.set('installState', 'started');

    const hardware = await validateHardware();
    if (typeof hardware?.gpu === 'string') config.set('detectedGpu', hardware.gpu);

    const optionsPromise = new Promise<InstallOptions>((resolve) => {
      ipcMain.once(IPC_CHANNELS.INSTALL_COMFYUI, (_event, installOptions: InstallOptions) => {
        log.verbose('Received INSTALL_COMFYUI.');
        resolve(installOptions);
      });
    });

    if (!hardware.isValid) {
      log.error(hardware.error);
      log.verbose('Loading not-supported renderer.');
      await this.appWindow.loadRenderer('not-supported');
    } else {
      log.verbose('Loading welcome renderer.');
      await this.appWindow.loadRenderer('welcome');
    }

    const installOptions = await optionsPromise;

    const installWizard = new InstallWizard(installOptions);
    useDesktopConfig().set('basePath', installWizard.basePath);

    const { device } = installOptions;
    if (device !== undefined) {
      useDesktopConfig().set('selectedDevice', device);
    }

    await installWizard.install();
    this.appWindow.maximize();
    if (installWizard.shouldMigrateCustomNodes && installWizard.migrationSource) {
      useDesktopConfig().set('migrateCustomNodesFrom', installWizard.migrationSource);
    }

    return new ComfyInstallation('installed', installWizard.basePath);
  }

  /**
   * Shows a dialog box to select a base path to install ComfyUI.
   * @param initialPath The initial path to show in the dialog box.
   * @returns The selected path, otherwise `undefined`.
   */
  async showBasePathPicker(initialPath?: string): Promise<string | undefined> {
    const defaultPath = initialPath ?? app.getPath('documents');
    const { filePaths } = await this.appWindow.showOpenDialog({
      defaultPath,
      properties: ['openDirectory', 'treatPackageAsDirectory', 'dontAddToRecent'],
    });
    return filePaths[0];
  }

  /** Notify user that the provided base apth is not valid. */
  async #showInvalidBasePathMessage() {
    await this.appWindow.showMessageBox({
      title: 'Invalid base path',
      message:
        'ComfyUI needs a valid directory set as its base path.  Inside, models, custom nodes, etc will be stored.\n\nClick OK, then selected a new base path.',
      type: 'error',
    });
  }

  /**
   * Resolves any issues found during installation validation.
   * @param installation The installation to resolve issues for
   * @param validation The validation result ({@link ComfyInstallation.validate}) containing any issues to resolve
   * @throws If the base path is invalid or cannot be saved
   */
  async resolveIssues(installation: ComfyInstallation, validation: ValidationResult) {
    const issues = [...validation.issues];
    for (const issue of issues) {
      switch (issue) {
        // TODO: Other issues (uv mising, venv etc)
        case 'invalidBasePath': {
          // TODO: Add IPC listeners and proper UI for this
          await this.#showInvalidBasePathMessage();

          const path = await this.showBasePathPicker();
          if (!path) return;

          const success = await installation.updateBasePath(path);
          if (!success) throw new Error('No base path selected or failed to save in config.');

          installation.issues.delete('invalidBasePath');
          break;
        }
      }
    }
    validation.issues.length = 0;
  }
}

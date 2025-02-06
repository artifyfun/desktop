import log from 'electron-log/main';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComfySettings, type ComfySettingsData, DEFAULT_SETTINGS, lockWrites } from '@/config/comfySettings';

vi.mock('electron-log/main', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('@/store/desktopConfig', () => ({
  useDesktopConfig: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue(path.join('test', 'base', 'path')),
  }),
}));

describe('ComfySettings', () => {
  const expectedFilePath = path.join('test', 'base', 'path', 'user', 'default', 'comfy.settings.json');
  let settings: ComfySettings;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (ComfySettings as any).instance = undefined;
    (ComfySettings as any).writeLocked = false;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    settings = ComfySettings.getInstance();
  });

  describe('write locking', () => {
    it('should allow writes before being locked', () => {
      settings.saveSettings();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(DEFAULT_SETTINGS, null, 2)
      );
    });

    it('should prevent writes after being locked', () => {
      lockWrites();
      expect(() => settings.saveSettings()).toThrow('Settings are locked');
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    it('should prevent modifications after being locked', () => {
      lockWrites();
      expect(() => settings.set('Comfy-Desktop.AutoUpdate', false)).toThrow('Settings are locked');
    });

    it('should allow reads after being locked', () => {
      lockWrites();
      expect(() => settings.get('Comfy-Desktop.AutoUpdate')).not.toThrow();
    });

    it('should share lock state across references', () => {
      const settings1 = settings;
      const settings2 = ComfySettings.getInstance();

      lockWrites();

      expect(() => settings1.set('Comfy-Desktop.AutoUpdate', false)).toThrow('Settings are locked');
      expect(() => settings2.set('Comfy-Desktop.AutoUpdate', false)).toThrow('Settings are locked');
    });

    it('should throw error when saving locked settings', () => {
      lockWrites();
      expect(() => settings.saveSettings()).toThrow('Settings are locked');
    });
  });

  describe('file operations', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should use correct file path', () => {
      settings.saveSettings();
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(DEFAULT_SETTINGS, null, 2)
      );
    });

    it('should load settings from file when available', () => {
      const mockSettings: ComfySettingsData = {
        'Comfy-Desktop.AutoUpdate': false,
        'Comfy-Desktop.SendStatistics': false,
        'Comfy.ColorPalette': 'dark',
        'Comfy.UseNewMenu': 'Top',
        'Comfy.Workflow.WorkflowTabsPosition': 'Topbar',
        'Comfy.Workflow.ShowMissingModelsWarning': true,
        'Comfy.Server.LaunchArgs': { test: 'value' },
        'Comfy-Desktop.UV.PythonInstallMirror': '',
        'Comfy-Desktop.UV.PypiInstallMirror': '',
        'Comfy-Desktop.UV.TorchInstallMirror': '',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSettings));

      expect(settings.get('Comfy-Desktop.AutoUpdate')).toBe(false);
      expect(settings.get('Comfy.Server.LaunchArgs')).toEqual({ test: 'value' });
      expect(settings.get('Comfy-Desktop.SendStatistics')).toBe(false);
    });

    it('should use default settings when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(settings.get('Comfy-Desktop.AutoUpdate')).toBe(DEFAULT_SETTINGS['Comfy-Desktop.AutoUpdate']);
    });

    it('should save settings to correct path with proper formatting', () => {
      settings.set('Comfy-Desktop.AutoUpdate', false);
      settings.saveSettings();

      // Get the last write call (first one is from initialization)
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.at(-1);
      if (!writeCall) throw new Error('No write calls recorded');
      const savedJson = JSON.parse(writeCall[1] as string);

      expect(writeCall[0]).toBe(expectedFilePath);
      expect(savedJson['Comfy-Desktop.AutoUpdate']).toBe(false);
    });

    it('should fall back to defaults on file read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        const error = new Error('Permission denied');
        log.error('Settings file cannot be loaded.', error);
        throw error;
      });

      settings.get('Comfy-Desktop.AutoUpdate');
      expect(settings.get('Comfy-Desktop.AutoUpdate')).toBe(DEFAULT_SETTINGS['Comfy-Desktop.AutoUpdate']);
    });
  });

  describe('settings operations', () => {
    it('should handle nested objects correctly', () => {
      const customLaunchArgs = { '--port': '8188', '--listen': '0.0.0.0' };
      settings.set('Comfy.Server.LaunchArgs', customLaunchArgs);
      expect(settings.get('Comfy.Server.LaunchArgs')).toEqual(customLaunchArgs);
    });

    it('should preserve primitive and object types when getting/setting values', () => {
      settings.set('Comfy-Desktop.SendStatistics', false);
      expect(typeof settings.get('Comfy-Desktop.SendStatistics')).toBe('boolean');

      const serverArgs = { test: 'value' };
      settings.set('Comfy.Server.LaunchArgs', serverArgs);
      expect(typeof settings.get('Comfy.Server.LaunchArgs')).toBe('object');
    });

    it('should fall back to defaults for null/undefined values in settings file', () => {
      const invalidSettings = {
        'Comfy-Desktop.AutoUpdate': undefined,
        'Comfy.Server.LaunchArgs': null,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidSettings));

      expect(settings.get('Comfy-Desktop.AutoUpdate')).toBe(DEFAULT_SETTINGS['Comfy-Desktop.AutoUpdate']);
      expect(settings.get('Comfy.Server.LaunchArgs')).toEqual(DEFAULT_SETTINGS['Comfy.Server.LaunchArgs']);
    });

    it('should fall back to defaults when settings file contains invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        const error = new Error('Invalid JSON');
        throw error;
      });

      settings.get('Comfy-Desktop.AutoUpdate');
      expect(settings.get('Comfy-Desktop.AutoUpdate')).toBe(DEFAULT_SETTINGS['Comfy-Desktop.AutoUpdate']);
    });

    it('should throw error on write error during saveSettings', () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        const error = new Error('Permission denied');
        throw error;
      });
      expect(() => settings.saveSettings()).toThrow('Permission denied');
    });
  });
});

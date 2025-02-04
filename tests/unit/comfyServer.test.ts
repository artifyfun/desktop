import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ComfyServer } from '@/main-process/comfyServer';

vi.mock('@/install/resourcePaths', () => ({
  getAppResourcesPath: vi.fn().mockReturnValue('/mocked/app_resources'),
}));

vi.mock('@/config/comfyServerConfig', () => ({
  ComfyServerConfig: {
    configPath: '/mocked/configPath',
  },
}));

describe('ComfyServer', () => {
  describe('buildLaunchArgs', () => {
    it('should convert basic arguments correctly', () => {
      const args = {
        port: '8188',
        host: 'localhost',
      };

      const result = ComfyServer.buildLaunchArgs(args);

      expect(result).toEqual(['--port', '8188', '--host', 'localhost']);
    });

    it('should handle empty string values by only including the flag', () => {
      const args = {
        cpu: '',
        port: '8188',
      };

      const result = ComfyServer.buildLaunchArgs(args);

      expect(result).toEqual(['--cpu', '--port', '8188']);
    });

    it('should handle no arguments', () => {
      const args = {};

      const result = ComfyServer.buildLaunchArgs(args);

      expect(result).toEqual([]);
    });

    it('should preserve argument order', () => {
      const args = {
        z: '3',
        a: '1',
        b: '2',
      };

      const result = ComfyServer.buildLaunchArgs(args);

      // Object entries preserve insertion order in modern JS
      expect(result).toEqual(['--z', '3', '--a', '1', '--b', '2']);
    });
  });

  describe('launchArgs', () => {
    it('should build launch args correctly', () => {
      const comfyServer = new ComfyServer(
        '/mocked/basePath',
        { port: '8188', listen: 'localhost' },
        null!,
        null!,
        null!
      );

      expect(comfyServer.launchArgs).toEqual([
        path.join(path.sep, 'mocked', 'app_resources', 'ComfyUI', 'main.py'),
        '--user-directory',
        path.join(path.sep, 'mocked', 'basePath', 'user'),
        '--input-directory',
        path.join(path.sep, 'mocked', 'basePath', 'input'),
        '--output-directory',
        path.join(path.sep, 'mocked', 'basePath', 'output'),
        '--front-end-root',
        path.join(path.sep, 'mocked', 'app_resources', 'ComfyUI', 'web_custom_versions', 'desktop_app'),
        '--base-directory',
        '/mocked/basePath',
        '--extra-model-paths-config',
        '/mocked/configPath',
        '--port',
        '8188',
        '--listen',
        'localhost',
      ]);
    });

    it('should handle extra server args correctly', () => {
      const comfyServer = new ComfyServer(
        '/mocked/basePath',
        { port: '8188', listen: 'localhost', cpu: '', z: '3' },
        null!,
        null!,
        null!
      );

      expect(comfyServer.launchArgs).toEqual([
        path.join(path.sep, 'mocked', 'app_resources', 'ComfyUI', 'main.py'),
        '--user-directory',
        path.join(path.sep, 'mocked', 'basePath', 'user'),
        '--input-directory',
        path.join(path.sep, 'mocked', 'basePath', 'input'),
        '--output-directory',
        path.join(path.sep, 'mocked', 'basePath', 'output'),
        '--front-end-root',
        path.join(path.sep, 'mocked', 'app_resources', 'ComfyUI', 'web_custom_versions', 'desktop_app'),
        '--base-directory',
        '/mocked/basePath',
        '--extra-model-paths-config',
        '/mocked/configPath',
        '--port',
        '8188',
        '--listen',
        'localhost',
        '--cpu',
        '--z',
        '3',
      ]);
    });
  });
});

import { ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { registerArtifyHandlers } from '../../../src/artifylab/handlers';

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

// Mock dialog and shell
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

// Mock useDesktopConfig with a simpler approach
const mockGet = vi.fn();
vi.mock('../../../src/store/desktopConfig', () => ({
  useDesktopConfig: () => ({
    get: mockGet,
  }),
}));

describe('ArtifyLab Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerArtifyHandlers();
  });

  describe('openOutputFolder', () => {
    test('should register openOutputFolder handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('artify-openOutputFolder', expect.any(Function));
    });

    test('should open output folder successfully', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(shell.openPath).mockResolvedValue('');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openOutputFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: true,
        path: path.join('/test/base/path', 'output'),
      });
      expect(shell.openPath).toHaveBeenCalledWith(path.join('/test/base/path', 'output'));
    });

    test('should create output folder if it does not exist', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(shell.openPath).mockResolvedValue('');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openOutputFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: true,
        path: path.join('/test/base/path', 'output'),
      });
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/test/base/path', 'output'), { recursive: true });
      expect(shell.openPath).toHaveBeenCalledWith(path.join('/test/base/path', 'output'));
    });

    test('should handle missing base path error', async () => {
      mockGet.mockReturnValue(undefined);

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openOutputFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: false,
        error: 'Base path not configured',
      });
    });

    test('should handle shell.openPath error', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(shell.openPath).mockRejectedValue(new Error('Failed to open path'));

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openOutputFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: false,
        error: 'Failed to open path',
      });
    });
  });

  describe('getOutputPath', () => {
    test('should register getOutputPath handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('artify-getOutputPath', expect.any(Function));
    });

    test('should return output path successfully', async () => {
      mockGet.mockReturnValue('/test/base/path');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-getOutputPath'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: true,
        path: path.join('/test/base/path', 'output'),
      });
    });

    test('should handle missing base path error', async () => {
      mockGet.mockReturnValue(undefined);

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-getOutputPath'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any);

      expect(result).toEqual({
        success: false,
        error: 'Base path not configured',
      });
    });
  });

  describe('scanFolder', () => {
    test('should register scanFolder handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('artify-scanFolder', expect.any(Function));
    });

    test('should scan folder and return file information', async () => {
      const mockStats = {
        isDirectory: () => true,
        size: 1024,
        mtime: new Date('2024-01-01'),
      };

      const mockFileStats = {
        isDirectory: () => false,
        size: 512,
        mtime: new Date('2024-01-02'),
      };

      const mockDirStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date('2024-01-03'),
      };

      vi.mocked(fs.statSync)
        .mockReturnValueOnce(mockStats as any) // Root directory
        .mockReturnValueOnce(mockFileStats as any) // File in root
        .mockReturnValueOnce(mockDirStats as any); // Subdirectory

      vi.mocked(fs.readdirSync).mockReturnValue(['file1.txt', 'subdir'] as any);

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-scanFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, '/test/path');

      expect(result).toEqual([
        {
          fullPath: path.join('/test/path', 'file1.txt'),
          fileName: 'file1.txt',
          extension: '.txt',
          size: 512,
          isDirectory: false,
          lastModified: new Date('2024-01-02'),
          relativePath: 'file1.txt',
        },
        {
          fullPath: path.join('/test/path', 'subdir'),
          fileName: 'subdir',
          extension: '',
          size: 0,
          isDirectory: true,
          lastModified: new Date('2024-01-03'),
          relativePath: 'subdir',
        },
      ]);
    });

    test('should throw error if path is not a directory', async () => {
      const mockStats = {
        isDirectory: () => false,
      };

      vi.mocked(fs.statSync).mockReturnValue(mockStats as any);

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-scanFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      await expect(handlerFn?.(null as any, '/test/file.txt')).rejects.toThrow('Path is not a directory');
    });

    test('should handle inaccessible files gracefully', async () => {
      const mockStats = {
        isDirectory: () => true,
        size: 0,
        mtime: new Date('2024-01-01'),
      };

      vi.mocked(fs.statSync)
        .mockReturnValueOnce(mockStats as any) // Root directory
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        }); // Inaccessible file

      vi.mocked(fs.readdirSync).mockReturnValue(['inaccessible.txt'] as any);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-scanFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, '/test/path');

      expect(result).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Cannot access /test/path/inaccessible.txt:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('openRootFolder', () => {
    test('should register openRootFolder handler', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('artify-openRootFolder', expect.any(Function));
    });

    test('should open specified folder when it exists', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(shell.openPath).mockResolvedValue('');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openRootFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, 'models');

      expect(result).toEqual({
        success: true,
        path: path.join('/test/base/path', 'models'),
        openedFolder: 'models',
      });
      expect(shell.openPath).toHaveBeenCalledWith(path.join('/test/base/path', 'models'));
    });

    test('should open root directory when specified folder does not exist', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(shell.openPath).mockResolvedValue('');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openRootFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, 'nonexistent');

      expect(result).toEqual({
        success: true,
        path: '/test/base/path',
        openedFolder: 'root',
        message: "Folder 'nonexistent' not found, opened root directory instead",
      });
      expect(shell.openPath).toHaveBeenCalledWith('/test/base/path');
    });

    test('should open root directory when specified path is not a directory', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(shell.openPath).mockResolvedValue('');

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openRootFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, 'file.txt');

      expect(result).toEqual({
        success: true,
        path: '/test/base/path',
        openedFolder: 'root',
        message: "Folder 'file.txt' not found, opened root directory instead",
      });
      expect(shell.openPath).toHaveBeenCalledWith('/test/base/path');
    });

    test('should handle missing base path error', async () => {
      mockGet.mockReturnValue(undefined);

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openRootFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, 'output');

      expect(result).toEqual({
        success: false,
        error: 'Base path not configured',
      });
    });

    test('should handle shell.openPath error', async () => {
      mockGet.mockReturnValue('/test/base/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(shell.openPath).mockRejectedValue(new Error('Failed to open path'));

      const handlerFn = vi.mocked(ipcMain.handle).mock.calls.find(
        ([channel]) => channel === 'artify-openRootFolder'
      )?.[1];

      expect(handlerFn).toBeDefined();

      const result = await handlerFn?.(null as any, 'output');

      expect(result).toEqual({
        success: false,
        error: 'Failed to open path',
      });
    });
  });
}); 
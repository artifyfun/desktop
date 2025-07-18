import { describe, it, expect, beforeEach, vi } from 'vitest';
import appStoreManager, { type App } from '../../../src/artifylab/appStore';

// Mock electron-store
vi.mock('electron-store', () => {
  const mockStore = {
    get: vi.fn(),
    set: vi.fn(),
  };
  return {
    default: vi.fn(() => mockStore),
  };
});

describe('AppStoreManager', () => {
  beforeEach(() => {
    // 重置所有mock
    vi.clearAllMocks();
  });

  describe('createApp', () => {
    it('应该能够创建新的app', () => {
      const appData = {
        name: '测试App',
        description: '这是一个测试app',
        config: { key: 'value' }
      };

      const result = appStoreManager.createApp(appData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(appData.name);
      expect(result.description).toBe(appData.description);
      expect(result.config).toEqual(appData.config);
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });

  describe('getAllApps', () => {
    it('应该能够获取所有apps', () => {
      const mockApps: App[] = [
        {
          id: '1',
          name: 'App1',
          description: 'Description1',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      // Mock store.get to return mockApps
      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.getAllApps();

      expect(result).toEqual(mockApps);
    });
  });

  describe('getAppById', () => {
    it('应该能够根据ID获取app', () => {
      const mockApps: App[] = [
        {
          id: '1',
          name: 'App1',
          description: 'Description1',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.getAppById('1');

      expect(result).toEqual(mockApps[0]);
    });

    it('当app不存在时应该返回undefined', () => {
      const mockApps: App[] = [];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.getAppById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('updateApp', () => {
    it('应该能够更新app', () => {
      const mockApps: App[] = [
        {
          id: '1',
          name: 'App1',
          description: 'Description1',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const updateData = {
        name: 'UpdatedApp1',
        description: 'UpdatedDescription1'
      };

      const result = appStoreManager.updateApp('1', updateData);

      expect(result).not.toBeNull();
      expect(result?.name).toBe(updateData.name);
      expect(result?.description).toBe(updateData.description);
      expect(result?.updatedAt).toBeGreaterThan(mockApps[0].updatedAt);
    });

    it('当app不存在时应该返回null', () => {
      const mockApps: App[] = [];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.updateApp('nonexistent', { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('removeApp', () => {
    it('应该能够删除app', () => {
      const mockApps: App[] = [
        {
          id: '1',
          name: 'App1',
          description: 'Description1',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.removeApp('1');

      expect(result).toBe(true);
    });

    it('当app不存在时应该返回false', () => {
      const mockApps: App[] = [];

      const mockStore = require('electron-store').default();
      mockStore.get.mockReturnValue(mockApps);

      const result = appStoreManager.removeApp('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('importApps', () => {
    it('应该能够导入apps', () => {
      const mockApps: App[] = [
        {
          id: '1',
          name: 'ImportedApp1',
          description: 'ImportedDescription1',
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ];

      const mockStore = require('electron-store').default();

      appStoreManager.importApps(mockApps);

      expect(mockStore.set).toHaveBeenCalledWith('apps', mockApps);
    });
  });
}); 
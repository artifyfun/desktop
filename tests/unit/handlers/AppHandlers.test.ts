import { app, ipcMain } from 'electron';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { IPC_CHANNELS } from '@/constants';
import { registerAppHandlers } from '@/handlers/AppHandlers';

import { quitMessage } from '../setup';

const getHandler = (channel: string) => {
  const [, handlerFn] = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === channel) || [];
  return handlerFn;
};

describe('AppHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerAppHandlers();
  });

  describe('registerHandlers', () => {
    const handleChannels = [
      IPC_CHANNELS.QUIT,
      IPC_CHANNELS.RESTART_APP,
    ];
    test.each(handleChannels)('should register handler for %s', (ch) => {
      expect(ipcMain.handle).toHaveBeenCalledWith(ch, expect.any(Function));
    });
  });

  test('restart handler should call app.relaunch', async () => {
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.RESTART_APP, expect.any(Function));

    const handlerFn = getHandler(IPC_CHANNELS.RESTART_APP);
    await expect(handlerFn).rejects.toThrow(/^Cannot destructure property 'customMessage' of/);
    await expect(handlerFn?.(null!, [{}])).rejects.toThrow(quitMessage);
    expect(app.relaunch).toHaveBeenCalledTimes(1);
  });

  test('quit handler should call app.quit', () => {
    const handlerFn = getHandler(IPC_CHANNELS.QUIT);
    expect(handlerFn).toThrow(quitMessage);
  });

  // 注意：更新相关的测试现在由UpdaterService处理
  // 这里只保留应用重启和退出的测试
});

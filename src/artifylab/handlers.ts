import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import { useDesktopConfig } from '../store/desktopConfig';
import artifyUtils from '.'

export function registerArtifyHandlers() {
  ipcMain.handle('artify-selectFile', async (event, data) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (!canceled) {
      return filePaths[0]
    }
  })

  ipcMain.handle('artify-getConfig', async (event, data) => {
    return artifyUtils.getConfig()
  })

  ipcMain.handle('artify-loadComfyUI', async (event, data) => {
    artifyUtils.loadComfyUI()
  })

  ipcMain.handle('artify-loadArtifyLab', async (event, data) => {
    artifyUtils.loadArtifyLab()
  })

  ipcMain.handle('artify-getAppInfo', async (event, data) => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      repository: 'artifyfun/desktop', // 添加repository字段用于GitHub发布页
    }
  })

  /**
   * 打开output目录
   * @param event IPC事件
   * @returns 是否成功打开目录
   */
  ipcMain.handle('artify-openOutputFolder', async (event) => {
    try {
      const basePath = useDesktopConfig().get('basePath');
      if (!basePath) {
        throw new Error('Base path not configured');
      }
      
      const outputPath = path.join(basePath, 'output');
      
      // 检查目录是否存在，如果不存在则创建
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      
      // 打开目录
      await shell.openPath(outputPath);
      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Error opening output folder:', error);
      return { success: false, error: (error as Error).message };
    }
  })

  /**
   * 获取output目录路径
   * @param event IPC事件
   * @returns output目录的完整路径
   */
  ipcMain.handle('artify-getOutputPath', async (event) => {
    try {
      const basePath = useDesktopConfig().get('basePath');
      if (!basePath) {
        throw new Error('Base path not configured');
      }
      
      const outputPath = path.join(basePath, 'output');
      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Error getting output path:', error);
      return { success: false, error: (error as Error).message };
    }
  })

  /**
   * 扫描文件夹下所有文件，返回文件信息数组
   * @param event IPC事件
   * @param folderPath 要扫描的文件夹路径
   * @returns 文件信息数组，包含完整路径、文件名、后缀等信息
   */
  ipcMain.handle('artify-scanFolder', async (event, folderPath: string) => {
    try {
      // 验证路径是否存在且是目录
      const stats = fs.statSync(folderPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      const files: Array<{
        fullPath: string;
        fileName: string;
        extension: string;
        size: number;
        isDirectory: boolean;
        lastModified: Date;
        relativePath: string;
      }> = [];

      // 只扫描当前目录，不递归
      const items = fs.readdirSync(folderPath);
      for (const item of items) {
        const fullPath = path.join(folderPath, item);
        const itemRelativePath = item;
        try {
          const itemStats = fs.statSync(fullPath);
          const extension = path.extname(item);
          files.push({
            fullPath,
            fileName: item,
            extension,
            size: itemStats.size,
            isDirectory: itemStats.isDirectory(),
            lastModified: itemStats.mtime,
            relativePath: itemRelativePath
          });
        } catch (error) {
          // 忽略无法访问的文件/目录
          console.warn(`Cannot access ${fullPath}:`, error);
        }
      }
      return files;
    } catch (error) {
      console.error('Error scanning folder:', error);
      throw error;
    }
  })

  /**
   * 打开根目录下的指定文件夹
   * @param event IPC事件
   * @param folderName 要打开的文件夹名称（如 'output', 'models' 等）
   * @returns 是否成功打开目录
   */
  ipcMain.handle('artify-openRootFolder', async (event, folderName: string) => {
    try {
      const basePath = useDesktopConfig().get('basePath');
      if (!basePath) {
        throw new Error('Base path not configured');
      }
      
      const targetPath = path.join(basePath, folderName);
      
      // 检查指定的文件夹是否存在
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        // 如果指定文件夹存在，直接打开
        await shell.openPath(targetPath);
        return { success: true, path: targetPath, openedFolder: folderName };
      } else {
        // 如果指定文件夹不存在，只打开根目录
        await shell.openPath(basePath);
        return { success: true, path: basePath, openedFolder: 'root', message: `Folder '${folderName}' not found, opened root directory instead` };
      }
    } catch (error) {
      console.error('Error opening root folder:', error);
      return { success: false, error: (error as Error).message };
    }
  })

  /**
   * 打开命令行
   * @param event IPC事件
   * @param type 命令行类型，python: python虚拟机环境下的python可执行文件
   * @returns 是否成功打开
   */
  ipcMain.handle('artify-openCMD', async (event, type: string) => {
    try {
      const basePath = useDesktopConfig().get('basePath');
      if (!basePath) {
        throw new Error('Base path not configured');
      }
      if (type === 'python') {
        const venvPath = path.join(basePath, '.venv');
        const pythonInterpreterPath =
        process.platform === 'win32'
          ? path.join(venvPath, 'Scripts', 'python.exe')
          : path.join(venvPath, 'bin', 'python');
        
        return {
          success: true,
          cmd: pythonInterpreterPath
        }
      }
    } catch (error) {
      console.error('Error opening cmd:', error);
      return { success: false, error: (error as Error).message };
    }
  })
}
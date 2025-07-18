import fs from 'node:fs';
import path from 'node:path';
import type { PluginOption } from 'vite';

/**
 * Vite plugin to copy static assets to the build directory
 */
export function viteStaticAssetsPlugin(): PluginOption {
  return {
    name: 'vite-static-assets-plugin',
    apply: 'build',
    closeBundle() {
      const sourceDir = path.resolve('src/artifylab/public');
      const targetDir = path.resolve('.vite/build/public');
      
      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // 复制静态资源文件
      function copyDirectory(src: string, dest: string) {
        if (!fs.existsSync(src)) {
          console.warn(`Source directory does not exist: ${src}`);
          return;
        }
        
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        
        const files = fs.readdirSync(src);
        
        for (const file of files) {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          
          const stat = fs.statSync(srcPath);
          
          if (stat.isDirectory()) {
            copyDirectory(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied: ${srcPath} -> ${destPath}`);
          }
        }
      }
      
      try {
        copyDirectory(sourceDir, targetDir);
        console.log('✅ Static assets copied successfully');
      } catch (error) {
        console.error('❌ Error copying static assets:', error);
      }
    },
  };
} 
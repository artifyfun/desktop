import { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'com.artifylab.comfyui-desktop',
  productName: 'Artify',
  copyright: 'Copyright © 2024 Comfy Org，Copyright © 2025 ArtifyFun',
  directories: {
    output: 'dist',
    buildResources: 'assets',
  },
  files: [
    'node_modules',
    'package.json',
    '.vite/**',
    '!assets/**',
    '!dist/**',
    '!src/**',
    '!scripts/**',
    '!.yarn/**',
    '!.yarnrc.yml',
    '!.husky/**',
  ],
  extraResources: [
    { from: './assets/ComfyUI', to: 'ComfyUI' },
    { from: './assets/uv', to: 'uv' },
    { from: './assets/UI', to: 'UI' },
    { from: './assets/requirements', to: 'requirements' },
  ],
  beforeBuild: './scripts/preMake.js',
  
  // 自动更新配置
  publish: {
    provider: 'github',
    owner: 'artifyfun',
    repo: 'desktop',
    releaseType: 'draft',
  },
  
  // Windows 配置
  win: {
    icon: './assets/UI/Comfy_Logo.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'zip',
        arch: ['x64'],
      },
    ],
    signAndEditExecutable: false,
  },
  
  // macOS 配置
  mac: {
    icon: './assets/UI/Comfy_Logo.icns',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    identity: null, // 禁用代码签名
    hardenedRuntime: false,
    gatekeeperAssess: false,
    // 禁用代码签名验证
    electronUpdaterCompatibility: '>=2.8',
    // 添加更新配置
    electronLanguages: ['en', 'zh-CN'],
  },
  
  // Linux 配置
  linux: {
    icon: './assets/UI/Comfy_Logo_x256.png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
    ],
    category: 'Graphics',
  },
  
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Artify',
    include: './scripts/installer.nsh',
  },
  
  dmg: {
    sign: false, // 禁用DMG签名
  },
  
  asarUnpack: ['**/node_modules/node-pty/**/*'],
  
  // 更新配置
  electronUpdaterCompatibility: '>=2.8',
};

export default config; 
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getAppResourcesPath } from '../install/resourcePaths';
import { getServer, startServer, getServerPort } from './server';

const DEV_MODE = false
const DEV_ORIGIN = `http://localhost:5000`
let comfy_origin: string
let web_root: string
let comfy_port: number
let appWindow: any
let serverArgs: any

function injectHtml () {
  const config = getConfig()
  web_root = path.join(getAppResourcesPath(), 'ComfyUI', 'web_custom_versions', 'desktop_app');
  const htmlPath = os.platform() === 'darwin' ? `${web_root}/index.html` : `${web_root}\\index.html`
  const bak = os.platform() === 'darwin' ? `${web_root}/index.html.bak` : `${web_root}\\index.html.bak`
  const indexHtml = fs.readFileSync(htmlPath, 'utf-8')
  try {
    fs.readFileSync(bak, 'utf-8')
  } catch (e) {
    fs.writeFileSync(bak, indexHtml)
  }
  const htmlContent = fs.readFileSync(bak, 'utf-8')
  const prodUrl = `${config.server_origin}/comfy_inject.min.js?rand=${Math.random()}`
  const devUrl = `${DEV_ORIGIN}/comfy_inject.js?rand=${Math.random()}`
  const injectScriptUrl = DEV_MODE ? devUrl : prodUrl
  const inject_html = htmlContent.replace('<head>', `<head><script src="${injectScriptUrl}"></script>`)
  fs.writeFileSync(htmlPath, inject_html)
}

function getUrl(serverArgs: any) {
  const config = getConfig()
  comfy_port = serverArgs.port
  const host = serverArgs.listen === '0.0.0.0' ? 'localhost' : serverArgs.listen;
  comfy_origin = `http://${host}:${serverArgs.port}`;
  const prodUrl = `${config.server_origin}`
  const devUrl = DEV_ORIGIN
  const url = DEV_MODE ? devUrl : prodUrl
  return url
}

function getConfig() {
  const server = getServer()
  if (!server) {
    throw new Error('Server is not running')
  }
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Invalid server address')
  }
  const port = address.port
  const server_origin = `http://localhost:${port}`;
  return {
    comfy_origin,
    comfy_port,
    web_root,
    server_origin,
    server_port: port
  }
}

function setAppWindow(window: any) {
  appWindow = window
}

function setServerArgs(args: any) {
  serverArgs = args
}

function loadComfyUI() {
  appWindow.loadComfyUI(serverArgs)
}

function loadArtifyLab() {
  appWindow.loadArtifyLab(serverArgs)
}

export default {
  injectHtml,
  getUrl,
  getConfig,
  startServer,
  getServerPort,
  setAppWindow,
  setServerArgs,
  loadComfyUI,
  loadArtifyLab,
  appWindow,
  serverArgs
}
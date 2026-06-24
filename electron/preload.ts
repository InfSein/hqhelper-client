/* eslint-disable */
import { contextBridge, ipcRenderer, app } from 'electron'
contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateReady: (callback: any) => ipcRenderer.on('update-ready', (event, ...args) => callback(...args)),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  restore: () => ipcRenderer.send('window-restore'),
  close: () => ipcRenderer.send('window-close'),
  clientPlatform: ipcRenderer.invoke('get-platform'),
  clientVersion: ipcRenderer.invoke('get-app-version'),
  httpGet: (url: string, timeout?: number) => ipcRenderer.invoke('http-get', { url, timeout }),
  simulatePing: (domain: string) => ipcRenderer.invoke('simulate-ping', domain),
  downloadUpdatePack: (url: string) => ipcRenderer.invoke('download-update-pack', url),
  downloadAndOpen: (url: string, fileName: string) => ipcRenderer.invoke('download-and-open', { url, fileName }),
  onUpdateProgress: (callback: any) => ipcRenderer.on('update-progress', (event, progressData) => callback(progressData)),
  openUrlByBrowser: (url: string) => ipcRenderer.send('open-url-by-browser', url),
  copyText: (text: string) => ipcRenderer.invoke('copy-text', text),
  createNewWindow: (id: string, url: string, defaultWidth: number, defaultHeight: number, title: string) => ipcRenderer.send('create-new-window', { id, url, defaultWidth, defaultHeight, title }),
  toggleAlwaysOnTop: () => ipcRenderer.send('toggle-always-on-top'),
  closeAllChildWindows: () => ipcRenderer.send('close-all-child-windows'),
  updateTitleBarTheme: (isDarkMode: boolean) => ipcRenderer.send('update-title-bar-theme', isDarkMode),
  openDevTools: () => ipcRenderer.send('open-dev-tools'),
})
contextBridge.exposeInMainWorld('fishXIV', {
  // 设置连接参数
  setConnection: (port: number, token: string) => {
    ipcRenderer.send('fish-xiv:set-connection', port, token);
  },

  // 获取最新快照（请求-响应模式）
  getLatestSnapshot: (): Promise<any> => {
    return ipcRenderer.invoke('fish-xiv:get-latest');
  },

  // 断开连接
  disconnect: () => {
    ipcRenderer.send('fish-xiv:disconnect');
  },

  // 监听背包更新
  onInventory: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('fish-xiv:inventory', handler);
    return () => ipcRenderer.removeListener('fish-xiv:inventory', handler);
  },

  // 监听心跳
  onHeartbeat: (callback: (data: { processId: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { processId: number }) => callback(data);
    ipcRenderer.on('fish-xiv:heartbeat', handler);
    return () => ipcRenderer.removeListener('fish-xiv:heartbeat', handler);
  },

  // 监听连接状态
  onConnected: (callback: () => void) => {
    ipcRenderer.on('fish-xiv:connected', callback);
    return () => ipcRenderer.removeListener('fish-xiv:connected', callback);
  },

  onDisconnected: (callback: () => void) => {
    ipcRenderer.on('fish-xiv:disconnected', callback);
    return () => ipcRenderer.removeListener('fish-xiv:disconnected', callback);
  },
});
contextBridge.exposeInMainWorld('$syncStore', {
  emit: (event: any, data: any) => {
    ipcRenderer.send('store-sync', { event, data })
  },
  on: (event: any, callback: any) => {
    ipcRenderer.on(`store-sync-${event}`, (_, data) => callback(data))
  }
})
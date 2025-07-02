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
  httpGet: (url: string) => ipcRenderer.invoke('http-get', url),
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
contextBridge.exposeInMainWorld('$syncStore', {
  emit: (event: any, data: any) => {
    ipcRenderer.send('store-sync', { event, data })
  },
  on: (event: any, callback: any) => {
    ipcRenderer.on(`store-sync-${event}`, (_, data) => callback(data))
  }
})
import { ipcMain } from 'electron';
import { FishXIVClient } from './ws-client';

export function registerFishXIVIpc(client: FishXIVClient) {
  ipcMain.handle('ws:connect', (_event, settings: { port: number; token: string }) => {
    return client.connect(settings);
  })
  ipcMain.handle('ws:disconnect', () => {
    return client.disconnect();
  })
  ipcMain.handle('ws:test-connection', (_event, settings: { port: number; token: string }) => {
    return client.testConnection(settings);
  })
}

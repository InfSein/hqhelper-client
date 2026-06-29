import { ipcMain } from 'electron';
import { FishXIVClient } from './ws-client';

export function registerFishXIVIpc(client: FishXIVClient) {
  ipcMain.on('ws:set-connection', (_event, port: number, token: string) => {
    client.updateConnection(port, token);
  });
  ipcMain.handle('ws:get-latest', () => {
    return client.getLatestSnapshot();
  });
  ipcMain.on('ws:disconnect', () => {
    client.disconnect();
  });
}
import { ipcMain } from 'electron';
import { FishXIVClient } from './fish-xiv-client';

export function registerFishXIVIpc(client: FishXIVClient) {
  // 渲染进程请求更新连接参数
  ipcMain.on('fish-xiv:set-connection', (_event, port: number, token: string) => {
    client.updateConnection(port, token);
  });

  // 渲染进程请求最新快照（用于窗口刚打开时同步状态）
  ipcMain.handle('fish-xiv:get-latest', () => {
    return client.getLatestSnapshot();
  });

  // 渲染进程请求断开
  ipcMain.on('fish-xiv:disconnect', () => {
    client.disconnect();
  });
}
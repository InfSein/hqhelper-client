import WebSocket from 'ws';
import { BrowserWindow, ipcMain } from 'electron';

interface PingMessage {
  cmdType: 1;
  processId: number;
}

interface InventoryItem {
  containerId: number;
  containerLabel: string;
  slotIndex: number;
  itemId: number;
  itemName: string;
  quantity: number;
  condition: number;
  spiritbondOrCollectability: number;
  glamourItemId: number;
  flags: number;
  flagsText: string;
  highQuality: boolean;
  collectable: boolean;
  address: string;
}

interface InventoryContainer {
  id: number;
  label: string;
  slots: number;
  itemCount: number;
}

interface InventorySnapshot {
  cmdType: 2;
  version: number;
  processId: number;
  containers: InventoryContainer[];
  items: InventoryItem[];
}

type ServerMessage = PingMessage | InventorySnapshot;

const DEFAULT_PORT = 17814;
const RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_TIMEOUT_MS = 5000; // 心跳间隔 1s，5s 未收到视为断开

export class FishXIVClient {
  private ws: WebSocket | null = null;
  private port: number;
  private token: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private latestSnapshot: InventorySnapshot | null = null;

  constructor(port = DEFAULT_PORT, token = '') {
    this.port = port;
    this.token = token;
  }

  updateConnection(port: number, token: string) {
    this.port = port;
    this.token = token;
    this.disconnect();
    this.connect();
  }

  connect() {
    if (this.ws) return;

    const url = `ws://127.0.0.1:${this.port}/inventory?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[ws-client] WebSocket 已连接');
      this.resetHeartbeatTimeout();
      this.notifyRenderer('ws:connected');
    });

    this.ws.on('message', (data) => {
      this.resetHeartbeatTimeout();
      try {
        const msg: ServerMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('[ws-client] 消息解析失败:', e);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[ws-client] WebSocket 已断开: ${code} ${reason}`);
      this.cleanup();
      this.notifyRenderer('ws:disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[ws-client] WebSocket 错误:', err.message);
      // error 后会触发 close，不需要在此重连
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  getLatestSnapshot(): InventorySnapshot | null {
    return this.latestSnapshot;
  }

  private handleMessage(msg: ServerMessage) {
    if (msg.cmdType === 1) {
      // 心跳：通知渲染进程进程 PID
      this.notifyRenderer('ws:heartbeat', { processId: msg.processId });
    } else if (msg.cmdType === 2) {
      this.latestSnapshot = msg;
      // 背包快照：推送到渲染进程
      this.notifyRenderer('ws:inventory', msg);
    }
  }

  private notifyRenderer(channel: string, data?: unknown) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  private resetHeartbeatTimeout() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[ws-client] 心跳超时，断开连接');
      this.ws?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private cleanup() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.removeAllListeners();
    this.ws = null;
  }
}
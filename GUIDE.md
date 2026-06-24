# FishXIVItemReader WebSocket 协议分析与 Electron 接入指南

## 一、WebSocket 协议详解

### 1.1 连接参数

| 参数 | 值 |
|------|-----|
| 地址 | `ws://127.0.0.1:{port}/inventory` |
| 默认端口 | `17814`（可在 ACT 插件面板中修改） |
| 路径 | `/inventory` 或 `/` |
| 认证 | URL 查询参数 `?token={accessToken}` |
| 本地性 | 仅监听 `127.0.0.1`，不支持远程连接 |

**完整连接 URL 示例：**
```
ws://127.0.0.1:17814/inventory?token=aBcDeFgHiJkLmNoPqRsTuVwXyZ012345
```

### 1.2 认证机制

- **Token 来源**：ACT 插件面板中显示的「WS凭证」，点击「复制」获取
- **Token 生成**：基于本机硬件指纹（CPU ID、主板序列号、BIOS 序列号、MachineGuid）+ 随机字节，经 SHA256 哈希后 Base64URL 编码
- **校验方式**：服务端使用常量时间比较（防时序攻击），Token 不匹配时返回 `401 Unauthorized`
- **Token 持久化**：Token 保存在 ACT 配置文件中，重启 ACT 不会改变，除非手动重新生成

### 1.3 消息格式

服务端发送的所有消息均为 **JSON 文本帧**（WebSocket opcode `0x1`）。通过 `cmdType` 字段区分消息类型：

#### 消息类型 1：心跳包（Ping）

每秒发送一次，无论背包数据是否变化。

```json
{
  "cmdType": 1,
  "processId": 12345
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `cmdType` | `number` | 固定为 `1` |
| `processId` | `number` | 当前监视的 FFXIV 进程 PID，无进程时为 `0` |

**用途**：检测连接存活、判断 FFXIV 进程是否在运行。

#### 消息类型 2：背包快照（InventorySnapshot）

仅在背包数据发生变化时发送。新客户端连接时会立即收到最新快照。

```json
{
  "cmdType": 2,
  "version": 1,
  "processId": 12345,
  "containers": [
    {
      "id": 0,
      "label": "背包 1",
      "slots": 35,
      "itemCount": 12
    }
  ],
  "items": [
    {
      "containerId": 0,
      "containerLabel": "背包 1",
      "slotIndex": 0,
      "itemId": 44011,
      "itemName": "物品 44011",
      "quantity": 99,
      "condition": 0,
      "spiritbondOrCollectability": 0,
      "glamourItemId": 0,
      "flags": 1,
      "flagsText": "高品质",
      "highQuality": true,
      "collectable": false,
      "address": "0x7FF612345678"
    }
  ]
}
```

**顶层字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `cmdType` | `number` | 固定为 `2` |
| `version` | `number` | 协议版本，当前为 `1` |
| `processId` | `number` | FFXIV 进程 PID |
| `containers` | `array` | 容器列表（背包页汇总） |
| `items` | `array` | 物品列表（每个物品一条记录） |

**containers 元素字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `number` | 容器 ID（对应 FFXIV 内部枚举） |
| `label` | `string` | 容器中文名称 |
| `slots` | `number` | 容器总槽位数（估算值） |
| `itemCount` | `number` | 容器中实际物品数量 |

**items 元素字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `containerId` | `number` | 所属容器 ID |
| `containerLabel` | `string` | 所属容器中文名称 |
| `slotIndex` | `number` | 槽位索引（从 0 开始） |
| `itemId` | `number` | 物品 ID（对应 FFXIV 物品表，可用于查物品名称/图标） |
| `itemName` | `string` | 占位名称，格式为 `"物品 {itemId}"`，不含真实物品名 |
| `quantity` | `number` | 数量 |
| `condition` | `number` | 耐久度或收藏品评价 |
| `spiritbondOrCollectability` | `number` | 灵魂绑定度 / 收藏品价值 |
| `glamourItemId` | `number` | 幻装物品 ID（0 表示无幻装） |
| `flags` | `number` | 标记位（见下表） |
| `flagsText` | `string` | 标记中文描述 |
| `highQuality` | `boolean` | 是否高品质 |
| `collectable` | `boolean` | 是否收藏品 |
| `address` | `string` | 内存地址（调试用，格式 `"0x..."`） |

**flags 位标记：**

| 值 | 名称 | flagsText 显示 |
|----|------|----------------|
| `0` | None | 空字符串 |
| `1` | HighQuality | 高品质 |
| `2` | CompanyCrestApplied | 部队纹章 |
| `4` | Relic | 古武 |
| `8` | Collectable | 收藏品 |

**容器 ID 对照表：**

| ID | 名称 | 备注 |
|----|------|------|
| `0-3` | 背包 1-4 | 各 35 格 |
| `1000` | 当前装备 | 14 格 |
| `2000` | 货币 | |
| `2001` | 水晶 | |
| `2004` | 重要物品 | |
| `3200-3210` | 兵装库各部位 | 35 格 |
| `3300` | 戒指库 | |
| `3400` | 灵魂水晶 | |
| `3500` | 武器库 | |
| `4000-4001` | 陆行鸟鞍囊 | 各 35 格 |
| `4100-4101` | 额外鞍囊 | 各 35 格 |
| `10000-10006` | 雇员仓库 1-7 | 各 35 格 |

### 1.4 连接行为

- 客户端断开后，服务端自动清理连接
- 服务端支持多个客户端同时连接
- 服务端发送的消息如与上一次完全相同（逐字节比较），则自动去重不发送
- 服务端不处理客户端发来的文本消息，仅响应 Ping（opcode `0x9`）和 Close（opcode `0x8`）帧

---

## 二、Electron 接入方案

### 2.1 架构总览

```
ACT 插件 (C#)
  └─ WebSocket Server (127.0.0.1:17814)
       │
       ▼
Electron Main Process
  ├─ WebSocket Client (ws 库)
  ├─ 连接管理 / 自动重连
  └─ IPC Bridge (ipcMain)
       │
       ▼
Electron Renderer Process (前端)
  ├─ IPC Bridge (ipcRenderer / contextBridge)
  └─ 业务逻辑 / UI 渲染
```

### 2.2 依赖

```bash
npm install ws
```

类型定义（如使用 TypeScript）：
```bash
npm install -D @types/ws
```

> Electron 的渲染进程不直接建立 WebSocket 连接，而是通过 IPC 从主进程接收数据。这样做可以：
> - 避免渲染进程直接管理网络连接的复杂性
> - 在主进程统一处理连接生命周期
> - 多窗口场景下共享同一个连接

### 2.3 主进程实现

#### 2.3.1 WebSocket 客户端模块

```typescript
// src/main/fish-xiv-client.ts
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
      console.log('[FishXIV] WebSocket 已连接');
      this.resetHeartbeatTimeout();
      this.notifyRenderer('fish-xiv:connected');
    });

    this.ws.on('message', (data) => {
      this.resetHeartbeatTimeout();
      try {
        const msg: ServerMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('[FishXIV] 消息解析失败:', e);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[FishXIV] WebSocket 已断开: ${code} ${reason}`);
      this.cleanup();
      this.notifyRenderer('fish-xiv:disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[FishXIV] WebSocket 错误:', err.message);
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
      this.notifyRenderer('fish-xiv:heartbeat', { processId: msg.processId });
    } else if (msg.cmdType === 2) {
      this.latestSnapshot = msg;
      // 背包快照：推送到渲染进程
      this.notifyRenderer('fish-xiv:inventory', msg);
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
      console.warn('[FishXIV] 心跳超时，断开连接');
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
```

#### 2.3.2 注册 IPC 处理

```typescript
// src/main/ipc.ts
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
```

#### 2.3.3 应用入口集成

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import { FishXIVClient } from './fish-xiv-client';
import { registerFishXIVIpc } from './ipc';

const fishClient = new FishXIVClient();

app.whenReady().then(() => {
  registerFishXIVIpc(fishClient);

  // 从配置读取端口和 Token（或让用户在 UI 中输入）
  const port = 17814;
  const token = '从 ACT 插件面板复制的 Token';
  fishClient.updateConnection(port, token);

  // 创建窗口 ...
});

app.on('before-quit', () => {
  fishClient.disconnect();
});
```

### 2.4 预加载脚本（Preload）

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fishXIV', {
  // 设置连接参数
  setConnection: (port: number, token: string) => {
    ipcRenderer.send('fish-xiv:set-connection', port, token);
  },

  // 获取最新快照（请求-响应模式）
  getLatestSnapshot: (): Promise<InventorySnapshot | null> => {
    return ipcRenderer.invoke('fish-xiv:get-latest');
  },

  // 断开连接
  disconnect: () => {
    ipcRenderer.send('fish-xiv:disconnect');
  },

  // 监听背包更新
  onInventory: (callback: (data: InventorySnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: InventorySnapshot) => callback(data);
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
```

### 2.5 渲染进程（前端）使用

#### TypeScript 类型声明

```typescript
// src/renderer/fish-xiv.d.ts
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

interface FishXIVAPI {
  setConnection(port: number, token: string): void;
  getLatestSnapshot(): Promise<InventorySnapshot | null>;
  disconnect(): void;
  onInventory(callback: (data: InventorySnapshot) => void): () => void;
  onHeartbeat(callback: (data: { processId: number }) => void): () => void;
  onConnected(callback: () => void): () => void;
  onDisconnected(callback: () => void): () => void;
}

declare interface Window {
  fishXIV: FishXIVAPI;
}
```

#### Vue 3 组合式 API 示例

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const connected = ref(false);
const processId = ref(0);
const containers = ref<InventoryContainer[]>([]);
const items = ref<InventoryItem[]>([]);
const port = ref(17814);
const token = ref('');

const cleanups: (() => void)[] = [];

onMounted(async () => {
  cleanups.push(
    window.fishXIV.onConnected(() => { connected.value = true }),
    window.fishXIV.onDisconnected(() => {
      connected.value = false;
      processId.value = 0;
    }),
    window.fishXIV.onHeartbeat((data) => {
      processId.value = data.processId;
    }),
    window.fishXIV.onInventory((snapshot) => {
      containers.value = snapshot.containers;
      items.value = snapshot.items;
    }),
  );

  // 尝试获取已有的快照（窗口启动时插件已在运行）
  const latest = await window.fishXIV.getLatestSnapshot();
  if (latest) {
    containers.value = latest.containers;
    items.value = latest.items;
    processId.value = latest.processId;
    connected.value = true;
  }
});

onUnmounted(() => {
  cleanups.forEach(fn => fn());
});

function connect() {
  window.fishXIV.setConnection(port.value, token.value);
}
</script>

<template>
  <div>
    <div>
      <label>端口: <input v-model.number="port" type="number" /></label>
      <label>Token: <input v-model="token" type="text" /></label>
      <button @click="connect">连接</button>
    </div>

    <div v-if="connected">
      <p>已连接 | FFXIV PID: {{ processId }}</p>
      <p>物品总数: {{ items.length }}</p>

      <div v-for="container in containers" :key="container.id">
        <h3>{{ container.label }} ({{ container.itemCount }}/{{ container.slots }})</h3>
        <ul>
          <li
            v-for="item in items.filter(i => i.containerId === container.id)"
            :key="`${item.containerId}-${item.slotIndex}`"
          >
            [{{ item.itemId }}] x{{ item.quantity }}
            <span v-if="item.highQuality">[HQ]</span>
            <span v-if="item.collectable">[收藏品]</span>
          </li>
        </ul>
      </div>
    </div>

    <div v-else>
      <p>未连接到 FishXIVItemReader</p>
    </div>
  </div>
</template>
```

### 2.6 物品名称解析

插件发送的 `itemName` 字段始终为 `"物品 {itemId}"` 占位文本，不含真实物品名。要显示真实名称，需要自行映射 `itemId`：

1. **使用 XIVAPI**：调用 `https://xivapi.com/Item/{itemId}` 获取物品名称和图标
2. **本地数据文件**：从 FFXIV 数据挖掘工具（如 SaintCoinach）导出物品表，在应用内维护一份 `itemId -> name` 映射
3. **缓存策略**：首次查询后缓存结果，避免重复请求

```typescript
// 简单的本地映射示例
const ITEM_NAMES: Record<number, string> = {
  44011: '绯色药水',
  // ... 从数据文件加载
};

function getItemName(itemId: number): string {
  return ITEM_NAMES[itemId] ?? `物品 ${itemId}`;
}
```

### 2.7 连接配置持久化

建议将端口和 Token 存储在 Electron 的 userData 目录中：

```typescript
// src/main/store.ts
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(app.getPath('userData'), 'fish-xiv-config.json');

interface Config {
  port: number;
  token: string;
}

export function loadConfig(): Config {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return { port: 17814, token: '' };
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
```

### 2.8 注意事项

1. **Token 安全**：Token 绑定到本机硬件，不可跨机器使用。不要将 Token 硬编码或提交到版本控制
2. **单实例连接**：建议主进程只维护一个 WebSocket 连接，通过 IPC 分发到所有窗口，避免多窗口各自连接
3. **重连策略**：插件可能未启动、ACT 未运行、或用户切换了端口，需实现自动重连并指数退避
4. **数据量**：完整快照可能包含数百个物品，注意渲染性能（虚拟滚动等）
5. **去重**：服务端对相同内容会去重不发送，但窗口首次打开时会立即收到最新快照
6. **`itemName` 是占位文本**：需要自行通过 `itemId` 查询真实物品名称

---

## 三、连接设置 UI：实时测试与无感切换

### 3.1 设计目标

- 用户在前端输入端口和 Token 时，**实时测试**连接是否可用
- 测试通过后点击确认，**无感切换**到新连接（旧连接保持到新连接建立后才断开）
- 整个过程中，已有的背包数据不丢失、连接状态指示不闪烁

### 3.2 核心原则

```
┌──────────────────────────────────────────────────────┐
│  渲染进程（设置面板）                                   │
│  用户输入 → 防抖 → 请求测试 → 展示结果 → 确认 → 应用   │
└────────────┬──────────────────────┬──────────────────┘
   测试请求   │          确认应用    │
             ▼                     ▼
┌──────────────────────────────────────────────────────┐
│  主进程                                               │
│  ┌─────────────┐    ┌──────────────────────────────┐ │
│  │ 临时测试连接  │    │ 生产连接（不中断）              │ │
│  │ 一次性 WebSocket │  │ 旧连接保持 → 新连接就绪 → 切换 │ │
│  └─────────────┘    └──────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

关键点：

1. **测试连接与生产连接完全隔离**：测试用一次性 WebSocket，不影响正在运行的生产连接
2. **先连后断**：确认应用时，先建立新连接，成功后再断开旧连接，实现零中断
3. **防抖测试**：用户输入时延迟触发测试，避免频繁请求
4. **渲染进程不持有 WebSocket**：所有连接操作都由主进程管理，渲染进程只发 IPC 指令

### 3.3 主进程改造

#### 3.3.1 测试连接（一次性 WebSocket）

```typescript
// src/main/fish-xiv-client.ts（新增方法）

import WebSocket from 'ws';

export type TestResult =
  | { ok: true; processId: number }
  | { ok: false; reason: 'timeout' | 'refused' | 'auth' | 'unknown'; message: string };

/**
 * 用一次性 WebSocket 测试连接是否可用。
 * 不影响当前正在运行的生产连接。
 * 返回 Promise，在收到第一条消息或超时后 resolve。
 */
export function testFishXIVConnection(port: number, token: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const url = `ws://127.0.0.1:${port}/inventory?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.removeAllListeners();
      ws.close();
      resolve({ ok: false, reason: 'timeout', message: '连接超时' });
    }, 3000);

    let settled = false;
    const done = (result: TestResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.removeAllListeners();
      ws.close();
      resolve(result);
    };

    ws.on('open', () => {
      // 连接建立，等待第一条消息确认认证通过
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // 收到任何消息（心跳或快照）说明认证通过
        done({ ok: true, processId: msg.processId ?? 0 });
      } catch {
        done({ ok: false, reason: 'unknown', message: '响应解析失败' });
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      const code = res.statusCode;
      if (code === 401) {
        done({ ok: false, reason: 'auth', message: '凭证无效 (401)' });
      } else {
        done({ ok: false, reason: 'unknown', message: `HTTP ${code}` });
      }
    });

    ws.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        done({ ok: false, reason: 'refused', message: '连接被拒绝，插件可能未启动' });
      } else {
        done({ ok: false, reason: 'unknown', message: err.message });
      }
    });
  });
}
```

#### 3.3.2 无感切换（先连后断）

```typescript
// src/main/fish-xiv-client.ts（FishXIVClient 类新增方法）

export class FishXIVClient {
  // ... 已有代码 ...

  /**
   * 无感切换到新连接。
   * 流程：建立新连接 → 收到首条消息 → 替换旧连接 → 断开旧连接。
   * 旧连接在新连接就绪前保持运行，用户不会感知到中断。
   */
  async switchConnection(port: number, token: string): Promise<boolean> {
    // 1. 建立新连接
    const newWs = await this.createReadyConnection(port, token);
    if (!newWs) return false;

    // 2. 替换：断开旧连接，接管新连接
    const oldWs = this.ws;
    this.cleanup(); // 清理旧的定时器和监听器

    // 3. 将新连接升级为生产连接
    this.ws = newWs;
    this.port = port;
    this.token = token;
    this.shouldReconnect = true;
    this.attachProductionListeners(newWs);

    // 4. 旧连接最后再关（避免竞态）
    if (oldWs) {
      oldWs.removeAllListeners();
      oldWs.close();
    }

    return true;
  }

  /**
   * 建立一个已就绪的 WebSocket（收到首条消息后才算就绪）。
   * 就绪前失败则返回 null。
   */
  private createReadyConnection(port: number, token: string): Promise<WebSocket | null> {
    return new Promise((resolve) => {
      const url = `ws://127.0.0.1:${port}/inventory?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.removeAllListeners();
        ws.close();
        resolve(null);
      }, 5000);

      let settled = false;
      const done = (result: WebSocket | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!result) {
          ws.removeAllListeners();
          ws.close();
        }
        resolve(result);
      };

      ws.on('open', () => {
        // 等待首条消息确认可用
      });

      ws.on('message', (data) => {
        // 收到消息 = 连接可用，返回 ws 实例
        // 首条消息稍后由 attachProductionListeners 处理
        this.resetHeartbeatTimeout();
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch { /* ignore parse error on first message */ }
        done(ws);
      });

      ws.on('error', () => done(null));
      ws.on('close', () => done(null));
    });
  }

  /**
   * 给已就绪的 WebSocket 绑定生产环境监听器。
   */
  private attachProductionListeners(ws: WebSocket) {
    ws.on('message', (data) => {
      this.resetHeartbeatTimeout();
      try {
        const msg: ServerMessage = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('[FishXIV] 消息解析失败:', e);
      }
    });

    ws.on('close', () => {
      this.cleanup();
      this.notifyRenderer('fish-xiv:disconnected');
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.error('[FishXIV] WebSocket 错误:', err.message);
    });

    this.resetHeartbeatTimeout();
  }
}
```

### 3.4 注册新 IPC 通道

```typescript
// src/main/ipc.ts（新增）

import { testFishXIVConnection, FishXIVClient } from './fish-xiv-client';
import { saveConfig } from './store';

export function registerFishXIVIpc(client: FishXIVClient) {
  // ... 已有的 ipcMain.on / handle ...

  // 测试连接（一次性，不影响当前连接）
  ipcMain.handle('fish-xiv:test', async (_event, port: number, token: string) => {
    return testFishXIVConnection(port, token);
  });

  // 确认应用新连接（无感切换）
  ipcMain.handle('fish-xiv:apply', async (_event, port: number, token: string) => {
    const ok = await client.switchConnection(port, token);
    if (ok) {
      saveConfig({ port, token });
    }
    return ok;
  });
}
```

### 3.5 Preload 新增桥接

```typescript
// src/preload/index.ts（新增部分）

contextBridge.exposeInMainWorld('fishXIV', {
  // ... 已有 ...

  /** 测试连接是否可用，不影响当前连接 */
  testConnection: (port: number, token: string): Promise<TestResult> => {
    return ipcRenderer.invoke('fish-xiv:test', port, token);
  },

  /** 确认应用新连接（无感切换 + 持久化配置） */
  applyConnection: (port: number, token: string): Promise<boolean> => {
    return ipcRenderer.invoke('fish-xiv:apply', port, token);
  },
});
```

同步更新类型声明：

```typescript
// src/renderer/fish-xiv.d.ts（新增）

type TestResult =
  | { ok: true; processId: number }
  | { ok: false; reason: 'timeout' | 'refused' | 'auth' | 'unknown'; message: string };

interface FishXIVAPI {
  // ... 已有 ...
  testConnection(port: number, token: string): Promise<TestResult>;
  applyConnection(port: number, token: string): Promise<boolean>;
}
```

### 3.6 前端设置面板（Vue 3）

核心交互流程：

```
用户输入 → 500ms 防抖 → 自动测试 → 显示结果
    ↓
用户点击「应用」→ 切换连接 → 关闭面板
```

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  currentPort: number;
  currentToken: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// ── 输入状态 ──
const port = ref(props.currentPort);
const token = ref(props.currentToken);

// ── 测试状态 ──
type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';
const testStatus = ref<TestStatus>('idle');
const testMessage = ref('');
const testProcessId = ref(0);

// ── 应用状态 ──
const applying = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// 输入变化时自动触发测试（防抖 500ms）
watch([port, token], () => {
  testStatus.value = 'idle';
  testMessage.value = '';
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!port.value || !token.value) return;
  debounceTimer = setTimeout(runTest, 500);
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

async function runTest() {
  // 输入未变化时跳过（比如和当前生效的配置相同）
  if (port.value === props.currentPort && token.value === props.currentToken) {
    testStatus.value = 'idle';
    testMessage.value = '';
    return;
  }

  testStatus.value = 'testing';
  testMessage.value = '测试中...';

  const result = await window.fishXIV.testConnection(port.value, token.value);

  if (result.ok) {
    testStatus.value = 'ok';
    testProcessId.value = result.processId;
    testMessage.value = result.processId > 0
      ? `连接成功 (FFXIV PID: ${result.processId})`
      : '连接成功（未检测到 FFXIV 进程）';
  } else {
    testStatus.value = 'fail';
    testMessage.value = result.message;
  }
}

async function apply() {
  if (testStatus.value !== 'ok') return;
  applying.value = true;
  const ok = await window.fishXIV.applyConnection(port.value, token.value);
  applying.value = false;
  if (ok) {
    emit('close');
  } else {
    testStatus.value = 'fail';
    testMessage.value = '切换失败，请重试';
  }
}

function resetToCurrent() {
  port.value = props.currentPort;
  token.value = props.currentToken;
  testStatus.value = 'idle';
  testMessage.value = '';
}
</script>

<template>
  <div class="connection-settings">
    <h3>连接设置</h3>

    <div class="field">
      <label>端口</label>
      <input v-model.number="port" type="number" min="1" max="65535" />
    </div>

    <div class="field">
      <label>Token</label>
      <div class="token-input">
        <input v-model="token" type="text" placeholder="从 ACT 插件面板复制" />
        <button @click="navigator.clipboard.writeText(token)" title="复制">📋</button>
      </div>
    </div>

    <!-- 测试结果指示 -->
    <div class="test-result" v-if="testStatus !== 'idle'">
      <span :class="['indicator', testStatus]">
        {{ { testing: '⏳', ok: '✓', fail: '✗' }[testStatus] }}
      </span>
      <span class="message">{{ testMessage }}</span>
    </div>

    <div class="actions">
      <button @click="resetToCurrent" class="secondary">重置</button>
      <button
        @click="apply"
        :disabled="testStatus !== 'ok' || applying"
        class="primary"
      >
        {{ applying ? '切换中...' : '应用' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.indicator.testing { color: #888; }
.indicator.ok { color: #4caf50; }
.indicator.fail { color: #f44336; }
.token-input { display: flex; gap: 4px; }
.token-input input { flex: 1; }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

### 3.7 完整数据流时序

```
用户在输入框中键入新端口
  │
  ├─ watch 触发，清除旧 debounceTimer
  ├─ 设置新 debounceTimer(500ms)
  │
  ├─ 500ms 后...
  │   ├─ testStatus = 'testing'
  │   ├─ ipcRenderer.invoke('fish-xiv:test', port, token)
  │   │   └─ 主进程：new WebSocket(url) → 一次性测试
  │   │       ├─ 收到消息 → { ok: true, processId }
  │   │       ├─ 401 响应 → { ok: false, reason: 'auth' }
  │   │       ├─ 连接拒绝 → { ok: false, reason: 'refused' }
  │   │       └─ 超时      → { ok: false, reason: 'timeout' }
  │   ├─ testStatus = 'ok' | 'fail'
  │   └─ 显示测试结果
  │
  ├─ 用户点击「应用」
  │   ├─ ipcRenderer.invoke('fish-xiv:apply', port, token)
  │   │   └─ 主进程：switchConnection(port, token)
  │   │       ├─ new WebSocket(url) → 等待首条消息
  │   │       ├─ 收到消息 → 新连接就绪
  │   │       ├─ 替换：旧 ws.close()，新 ws 升级为生产连接
  │   │       ├─ saveConfig() 持久化
  │   │       └─ return true
  │   ├─ emit('close') 关闭设置面板
  │   └─ 用户无感：期间心跳和背包数据从未中断
  │
  └─ 面板关闭，继续使用新连接
```

### 3.8 注意事项

1. **测试不影响生产**：测试用的 WebSocket 是独立实例，测试完成即关闭，不会干扰正在运行的生产连接
2. **先连后断的原子性**：`switchConnection` 内部先完成新连接握手，确认可用后才断开旧连接。如果新连接失败，旧连接不受影响
3. **防抖是必要的**：服务端连接数有限，用户快速输入不应触发大量测试请求
4. **配置持久化时机**：只在 `apply` 成功后才写入配置文件，测试失败不保存
5. **Token 输入体验**：建议提供一个「从剪贴板粘贴」按钮，因为 Token 是一长串 Base64URL 字符
6. **首条消息双消费**：`createReadyConnection` 中收到的首条消息会调用 `handleMessage` 处理（更新 `latestSnapshot` 等），所以切换后不会丢失首条快照数据
7. **多窗口同步**：`switchConnection` 只在主进程执行一次，所有窗口通过已有的 `notifyRenderer` 机制自动收到新连接的数据

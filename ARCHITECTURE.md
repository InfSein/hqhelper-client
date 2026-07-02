## 文件职责

- `electron/main.ts`：创建主窗口、注册应用 IPC、处理更新下载、窗口控制和应用退出清理。
- `electron/preload.ts`：通过 `contextBridge` 向前端暴露 Electron API 和 `window.wsApi`。
- `electron/ipc.ts`：注册 FishXIVItemReader WebSocket 相关 IPC handler。
- `electron/ws-client.ts`：维护 WebSocket 连接、测试连接、状态推送、断线重连和消息转发。
- `package.json`：维护 Electron 客户端依赖、构建命令和打包配置。

## 调用关系

- `main.ts` 创建 `FishXIVClient`，并调用 `registerFishXIVIpc()` 注册 IPC。
- 前端通过 `preload.ts` 暴露的 `window.wsApi` 调用 `ws:connect`、`ws:disconnect` 和 `ws:test-connection`。
- `ws-client.ts` 连接 FishXIVItemReader，收到 JSON 后用 `BrowserWindow.webContents.send('ws:message')` 推送给所有窗口。
- 连接状态变化通过 `ws:status` 推送给前端。

## 关键决定

- WebSocket token 只用于连接握手，不在日志中输出。
- 主进程负责断线重连，前端只负责根据用户设置发起连接或断开。
- 测试连接使用临时 WebSocket，不影响当前真实连接。
- 对连接请求做短延迟合并，减少设置频繁变化时的重复重连。

import WebSocket from 'ws'
import { BrowserWindow } from 'electron'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionSettings {
  port: number
  token: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
}

const RECONNECT_DELAY_MS = 5000
const CONNECT_DEBOUNCE_MS = 300
const TEST_TIMEOUT_MS = 5000

export class FishXIVClient {
  private ws: WebSocket | null = null
  private settings: ConnectionSettings | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  async connect(settings: ConnectionSettings): Promise<boolean> {
    const normalized = this.normalizeSettings(settings)
    if (!normalized) {
      this.setStatus('error')
      return false
    }

    this.settings = normalized
    this.shouldReconnect = true

    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
    }

    return new Promise((resolve) => {
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null
        this.openConnection(normalized)
        resolve(true)
      }, CONNECT_DEBOUNCE_MS)
    })
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.settings = null
    this.clearTimers()
    this.closeSocket()
    this.setStatus('disconnected')
  }

  async testConnection(settings: ConnectionSettings): Promise<ConnectionTestResult> {
    const normalized = this.normalizeSettings(settings)
    if (!normalized) {
      return { success: false, message: '端口或密钥无效' }
    }

    return new Promise((resolve) => {
      const socket = new WebSocket(this.buildUrl(normalized))
      const timer = setTimeout(() => {
        socket.removeAllListeners()
        socket.close()
        resolve({ success: false, message: '连接超时，请确认插件已启动' })
      }, TEST_TIMEOUT_MS)

      socket.once('open', () => {
        clearTimeout(timer)
        socket.close()
        resolve({ success: true, message: '连接成功' })
      })

      socket.once('error', (error) => {
        clearTimeout(timer)
        socket.removeAllListeners()
        socket.close()
        resolve({ success: false, message: this.formatError(error) })
      })
    })
  }

  private openConnection(settings: ConnectionSettings) {
    this.clearReconnectTimer()
    this.closeSocket()
    this.setStatus('connecting')

    const socket = new WebSocket(this.buildUrl(settings))
    this.ws = socket

    socket.on('open', () => {
      if (this.ws !== socket) return
      this.setStatus('connected')
    })

    socket.on('message', (data) => {
      if (this.ws !== socket) return
      this.forwardMessage(data)
    })

    socket.on('close', () => {
      if (this.ws !== socket) return
      this.ws = null
      this.setStatus('disconnected')
      this.scheduleReconnect()
    })

    socket.on('error', (error) => {
      if (this.ws !== socket) return
      console.error('[FishXIVItemReader] WebSocket 错误:', this.formatError(error))
      this.setStatus('error')
    })
  }

  private forwardMessage(data: WebSocket.RawData) {
    try {
      const message = JSON.parse(data.toString())
      this.notifyRenderer('ws:message', message)
    } catch (error) {
      console.error('[FishXIVItemReader] 消息解析失败:', error)
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || !this.settings || this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.settings) {
        this.openConnection(this.settings)
      }
    }, RECONNECT_DELAY_MS)
  }

  private normalizeSettings(settings: ConnectionSettings): ConnectionSettings | null {
    const port = Number(settings.port)
    const token = `${settings.token ?? ''}`.trim()
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
      return null
    }
    return { port, token }
  }

  private buildUrl(settings: ConnectionSettings) {
    return `ws://127.0.0.1:${settings.port}/inventory?token=${encodeURIComponent(settings.token)}`
  }

  private closeSocket() {
    if (!this.ws) return
    const socket = this.ws
    this.ws = null
    socket.removeAllListeners()
    socket.close()
  }

  private clearTimers() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.clearReconnectTimer()
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return
    this.status = status
    this.notifyRenderer('ws:status', status)
  }

  private notifyRenderer(channel: string, data?: unknown) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  private formatError(error: Error) {
    return error.message || '连接失败，请确认端口和密钥正确'
  }
}

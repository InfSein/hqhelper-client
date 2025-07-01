import { app, BrowserWindow, ipcMain, shell, clipboard, Menu, globalShortcut, screen, MenuItem, IpcMainInvokeEvent } from 'electron'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import unzipper from 'unzipper'
import dns from 'dns'
import net from 'net'
import logger from 'electron-log'
import { exec } from 'child_process'
import { promisify } from 'util'
import pkg from '../package.json'

const CLIENT_VERSION = pkg.clientVersion

// 仅在初次安装v7+客户端时执行，迁移旧客户端的用户数据
if (app.isPackaged) {
  const oldAppName = 'hqhelper-dawntrail'
  const appDataRoot = app.getPath('appData')
  const oldUserData = path.join(appDataRoot, oldAppName)
  const newUserData = path.join(appDataRoot, app.getName())
  if (fs.existsSync(oldUserData) && !fs.existsSync(newUserData)) {
    try {
      fs.cpSync(oldUserData, newUserData, { recursive: true })
    } catch (err) {
      console.error('[ERROR] Migration failed:', err)
    }
  }
}

const fsExists = promisify(fs.exists)
const fsUnlink = promisify(fs.unlink)

logger.transports.console.level = false
logger.transports.file.level = 'debug'
logger.transports.file.maxSize = 10024300 // 文件最大不超过 10M
logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}'
const date = new Date()
const dateStr = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
logger.transports.file.resolvePathFn = (variables) => {
  return `log/${dateStr}.log`
}

let mainWindow : BrowserWindow | null = null
const childWindows = new Map()

const ZIP_PATH = path.join(app.getPath('userData'), 'static-pages.zip')
const TEMP_DIR = path.join(app.getPath('userData'), 'static-pages-temp')
const WINDOW_SIZES_PATH = path.join(app.getPath('userData'), 'windowSizes.json')
const WINDOW_POSITIONS_PATH = path.join(app.getPath('userData'), 'windowPositions.json')
const EXTRACTED_DIR = path.join(TEMP_DIR, 'dist')
const STATICPAGE_DIR = path.join(process.resourcesPath, 'static-pages')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1620,
    height: 835,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(255,255,255,0.5)',
      height: 35,
      symbolColor: 'black'
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  let indexPath = ''
  if (app.isPackaged) {
    // 生产环境
    const STATICPAGE_DIR = path.join(process.resourcesPath, 'static-pages')
    indexPath = path.join(STATICPAGE_DIR, 'index.html')
  } else {
    // 开发环境
    indexPath = path.join(__dirname, '..', 'hqhelper', 'dist', 'index.html')
  }
  mainWindow.loadURL(`file://${indexPath}`)

  // 创建自定义菜单
  const menuTemplate : MenuItem[] = [
    /*
    {
      label: '窗口',
      submenu: [
        {
          label: '始终置顶',
          type: 'checkbox',
          click: (menuItem) => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.setAlwaysOnTop(menuItem.checked)
            }
          },
        }
      ],
    },
    */
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  // #region 应用快捷键

  // 当窗口获得焦点时，注册快捷键
  mainWindow.on('focus', () => {
    registerShortcut()
  })
  // 当窗口失去焦点时，注销快捷键
  mainWindow.on('blur', () => {
    unregisterShortcut()
  })

  // 在退出应用时注销所有快捷键
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  function registerShortcut() {
    globalShortcut.register('Shift+Control+I', () => {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow) {
        focusedWindow.webContents.openDevTools()
      }
    })
  }
  function unregisterShortcut() {
    globalShortcut.unregister('Shift+Control+I')
  }
  
  // #endregion

  mainWindow.on('closed', function () {
    closeAllChildWindows()
    mainWindow = null
  })

  ipcMain.on('check-for-updates', async () => {
    logger.warn('[common-warn] 调用了被弃用的API: check-for-updates')
    return 'api deprecated'
  })

  ipcMain.on('install-update', () => {
    logger.warn('[common-warn] 调用了被弃用的API: install-update')
    return 'api deprecated'
  })

  ipcMain.on('window-minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })
  
  ipcMain.on('window-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window?.isMaximized()) {
      window.restore()
    } else {
      window?.maximize()
    }
  })
  
  ipcMain.on('window-restore', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.restore()
  })
  
  ipcMain.on('window-close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  /* 获取客户端的当前版本(需要手动修改CONST值) */
  ipcMain.handle('get-app-version', () => {
    return CLIENT_VERSION
  })
  
  /* 向给定URL发送GET请求，成功时返回字符串格式的数据 */
  ipcMain.handle('http-get', async (event, url) => {
    console.log('GET', url)
    try {
      const response = await axios.get(url, { timeout: 3000 })
      let data = response.data
      if (typeof(data) !== 'string') data = JSON.stringify(data)
      console.log('RESPONSE', data)
      return data
    } catch (error) {
      throw error
    }
  })
  
  /* 检查给定域名的延迟，返回延迟时间(ms)或超时信息 */
  ipcMain.handle('simulate-ping', async (event, hostname) => {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      if (hostname.startsWith('http://') || hostname.startsWith('https://'))
        hostname = new URL(hostname).hostname
      dns.lookup(hostname, (err, address) => {
        if (err) {
          console.log('DNS lookup failed:', err)
          return reject("error")
        }
        const socket = new net.Socket()
        socket.setTimeout(2000)
        socket.connect(80, address, () => {
          const latency = Date.now() - start
          console.log(`PING ${hostname} latency: ${latency}ms`)
          socket.destroy(); resolve(latency)
        })
        socket.on('error', (err) => {
          console.log(`PING ${hostname} FAILED DUE TO`, err)
          socket.destroy(); reject("error")
        })
        socket.on('timeout', () => {
          console.log(`PING ${hostname} TIMED OUT`)
          socket.destroy(); reject("timeout")
        })
      })
    })
  })

  function sendProgress(event : IpcMainInvokeEvent, stage : string, progress : any, error : any = undefined) {
    event.sender.send('update-progress', { stage, progress, error })
  }
  async function downloadFromUrl(event: IpcMainInvokeEvent, url: string) {
    let previousTime = Date.now()
    let previousDownloaded = 0
    const response = await axios.get(url, {
      responseType: 'stream',
      onDownloadProgress: (progressEvent) => {
        const totalBytes = progressEvent.total ?? -1
        const downloadedBytes = progressEvent.loaded

        // Calculate time difference and bytes difference
        const currentTime = Date.now()
        const timeDiff = (currentTime - previousTime) / 1000 // in seconds
        const bytesDiff = downloadedBytes - previousDownloaded

        // Calculate current speed in MB/s
        const speed = (bytesDiff / (1024 * 1024)) / timeDiff

        // Update previous values
        previousTime = currentTime
        previousDownloaded = downloadedBytes

        const progress = {
          total: (totalBytes / (1024 * 1024)).toFixed(2), // MB
          downloaded: (downloadedBytes / (1024 * 1024)).toFixed(2), // MB
          speed: speed.toFixed(2) // MB/s (for simplicity)
        }
        sendProgress(event, 'downloading', progress)
      }
    })
    return response
  }
  
  /* 从给定URL下载WEB项目更新包，并在下载成功后自动重启 */
  ipcMain.handle('download-update-pack', async (event, url) => {
    const log_info = (msg: string) => logger.info('[download-update-pack] ' + msg)
    const log_error = (msg: string) => logger.error('[download-update-pack] ' + msg)
    try {
      log_info('开始下载')
      log_info('下载URL: ' + url)
      sendProgress(event, 'requesting', {})
      const response = await downloadFromUrl(event, url)
      const writeStream = fs.createWriteStream(ZIP_PATH)
      response.data.pipe(writeStream)

      writeStream.on('finish', async () => {
        log_info('下载成功')
        try {
          log_info('开始解压')
          log_info('ZIP_PATH=' + ZIP_PATH)
          log_info('TEMP_DIR=' + TEMP_DIR)
          sendProgress(event, 'extracting', {})
          await extractZipFile(ZIP_PATH, TEMP_DIR)
          console.log('ZIP file extracted successfully')
          log_info('解压成功')
        } catch (error: any) {
          log_error('解压期间发生错误：' + error)
          sendProgress(event, 'end', {}, {
            msg: error.message,
            onstage: 'extracting',
          })
          return 'error'
        }
        try {
          log_info('开始替换本地文件')
          log_info('EXTRACTED_DIR=' + EXTRACTED_DIR)
          log_info('STATICPAGE_DIR=' + STATICPAGE_DIR)
          sendProgress(event, 'replacing', {})
          updateLocalFiles(EXTRACTED_DIR, STATICPAGE_DIR)
          log_info('替换成功')
        } catch (error: any) {
          log_error('替换本地文件发生错误：' + error)
          sendProgress(event, 'end', {}, {
            msg: error.message,
            onstage: 'replacing',
          })
          return 'error'
        }
        try {
          sendProgress(event, 'cleaning', {})
          fs.rmSync(TEMP_DIR, { recursive: true, force: true })
          log_info('临时文件清理成功')
        } catch (error: any) {
          log_error('清理临时文件发生错误：' + error)
          sendProgress(event, 'end', {}, {
            msg: error.message,
            onstage: 'cleaning',
          })
          return 'error'
        }
        try {
          sendProgress(event, 'relaunching', {})
          app.relaunch()
          app.exit()
        } catch (error: any) {
          log_error('重启应用失败：' + error)
          sendProgress(event, 'end', {}, {
            msg: error.message,
            onstage: 'relaunching',
          })
          return 'error'
        }
      })

      writeStream.on('error', (error) => {
        log_error('下载期间发生错误：' + error)
        sendProgress(event, 'end', {}, {
          msg: error.message,
          onstage: 'downloading',
        })
        return 'error'
      })

      writeStream.on('close', () => {
        log_info('下载完成')
      })

      return ''
    } catch (error: any) {
      log_error('检查更新时发生错误：' + error)
      sendProgress(event, 'end', {}, {
        msg: error.toString(),
        onstage: 'requesting',
      })
      throw error
    }
  })
  
  /* 从给定URL下载EXE文件，并在下载成功后自动打开 */
  ipcMain.handle('download-and-open', async (event, { url, fileName }) => {
    const log_info = (...params: any[]) => logger.info('[download-and-open] ', ...params)
    const log_error = (...params: any[]) => logger.error('[download-and-open] ', ...params)
    try {
      log_info('开始检查/清理临时文件')
      const EXE_PATH = path.join(app.getPath('userData'), fileName)
      log_info('EXE_PATH: ' + EXE_PATH)
      const fileExists = await fsExists(EXE_PATH)
      if (fileExists) {
        await fsUnlink(EXE_PATH)
      }
      log_info('检查/清理临时文件成功')

      log_info('下载URL: ' + url)
      sendProgress(event, 'requesting', {})
      const response = await downloadFromUrl(event, url)
      const writeStream = fs.createWriteStream(EXE_PATH)
      response.data.pipe(writeStream)

      writeStream.on('finish', async () => {
        log_info('下载成功，开始尝试启动安装程序')
        sendProgress(event, 'opening', {})
        exec(`"${EXE_PATH}"`, (err, stdout, stderr) => {
          if (err) {
            log_error('启动程序时出错:', err)
            throw new Error('启动安装程序失败')
          }
        })
        sendProgress(event, 'end', {})
      })

      writeStream.on('error', (error) => {
        log_error('下载期间发生错误：', error)
        sendProgress(event, 'end', {}, {
          msg: error.message,
          onstage: 'downloading',
        })
        throw error
      })

      writeStream.on('close', () => {
        log_info('下载完成')
      })

      return ''
    } catch (error: any) {
      log_error('检查更新时发生错误：', error)
      sendProgress(event, 'end', {}, {
        msg: error.message,
        onstage: 'requesting',
      })
      throw error
    }
  })
  
  /* 调用默认浏览器打开给定URL */
  ipcMain.on('open-url-by-browser', (event, url) => {
    try {
      shell.openExternal(url)
    } catch (error) {
      throw error
    }
  })
  
  /* 复制给定字符串 (electron环境下调用网页的复制方法不生效，需要专门写一个API) */
  ipcMain.handle('copy-text', (event, text) => {
    try {
      clipboard.writeText(text)
      return ''
    } catch (e: any) {
      return e?.message ?? e
    }
  })

  /* 创建新窗口 */
  ipcMain.on('create-new-window', (event, { id, url, defaultWidth, defaultHeight, title }) => {
    createNewWindow({ id, url, defaultWidth, defaultHeight, title })
  })
  const createNewWindow = ({ id, url, defaultWidth, defaultHeight, title }: any) => {
    // 如果已经有这个窗口了，bring it to front
    if (childWindows.has(id)) {
      const existingWindow = childWindows.get(id)
      if (!existingWindow.isDestroyed()) {
        existingWindow.focus()
        return
      } else {
        childWindows.delete(id) // 如果窗口已被销毁，删除它
      }
    }

    // 读取尺寸
    const size = loadWindowSizes()[id] || { width: defaultWidth, height: defaultHeight }
    let width = size.width || defaultWidth; let height = size.height || defaultHeight
    if (width < 100) width = 100
    if (height < 100) height = 100

    // 读取位置
    const position = loadWindowPosition()[id] || { x: undefined, y: undefined }
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
    const x = position.x !== undefined && position.x < screenWidth * 0.9 ? position.x : Math.floor(screenWidth / 2 - size.width / 2)
    const y = position.y !== undefined && position.y < screenHeight * 0.9 ? position.y : Math.floor(screenHeight / 2 - size.height / 2)

    const newWindow = new BrowserWindow({
      width: width,
      height: height,
      x, y,
      title: title || 'HqHelper Sub-window',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'preload.js'),
      }
    })
    newWindow.loadURL(url)

    newWindow.webContents.on('did-finish-load', () => {
      newWindow.setTitle(title || 'HqHelper Sub-window')
    })

    newWindow.on('resize', () => {
      const [newWidth, newHeight] = newWindow.getSize()
      saveWindowSize(id, newWidth, newHeight)
    })
    newWindow.on('move', () => {
      const [newX, newY] = newWindow.getPosition()
      saveWindowPosition(id, newX, newY)
    })

    childWindows.set(id, newWindow)
    newWindow.on('closed', () => {
      childWindows.delete(id)
    })

    function loadWindowSizes() {
      if (fs.existsSync(WINDOW_SIZES_PATH)) {
        return JSON.parse(fs.readFileSync(WINDOW_SIZES_PATH, 'utf-8'))
      }
      return {}
    }
    function saveWindowSize(id: string, width: number, height: number) {
      const sizes = loadWindowSizes()
      sizes[id] = { width, height }
      fs.writeFileSync(WINDOW_SIZES_PATH, JSON.stringify(sizes))
    }

    function loadWindowPosition() {
      if (fs.existsSync(WINDOW_POSITIONS_PATH)) {
        return JSON.parse(fs.readFileSync(WINDOW_POSITIONS_PATH, 'utf-8'))
      }
      return {}
    }
    function saveWindowPosition(id: string, x: number, y: number) {
      const positions = loadWindowPosition()
      positions[id] = { x, y }
      fs.writeFileSync(WINDOW_POSITIONS_PATH, JSON.stringify(positions))
    }
  }

  /* 切换窗口置顶 */
  ipcMain.on('toggle-always-on-top', (event) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      const isAlwaysOnTop = focusedWindow.isAlwaysOnTop()
      focusedWindow.setAlwaysOnTop(!isAlwaysOnTop, 'normal')
    }
  })

  /* 关闭所有子窗口 */
  ipcMain.on('close-all-child-windows', () => {
    closeAllChildWindows()
  })
  const closeAllChildWindows = () => {
    for (const [id, win] of childWindows.entries()) {
      if (!win.isDestroyed()) {
        win.close()
      }
    }
  }

  /* 同步多窗口间的 vuex-store */
  ipcMain.on('store-sync', (event, { event: name, data }) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (win.webContents !== event.sender) {
        win.webContents.send(`store-sync-${name}`, data)
      }
    })
  })

  /* 更新标题栏操作按钮的主题 */
  ipcMain.on('update-title-bar-theme', (event, isDarkMode) => {
    updateTitleBarTheme(mainWindow, isDarkMode)
  })
  function updateTitleBarTheme(window: any, isDarkMode: boolean) {
    const color = isDarkMode ? '#18181c' : '#ffffff'
    const symbolColor = isDarkMode ? 'white' : 'black'
  
    window.setTitleBarOverlay({
      color: color,
      height: 35,
      symbolColor: symbolColor,
    })
  }

  /* 打开开发者工具 */
  ipcMain.on('open-dev-tools', (event) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      focusedWindow.webContents.openDevTools()
    }
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  if (mainWindow === null) createWindow()
})

async function extractZipFile(zipPath: string, extractionDir: string) {
  try {
    await fs.promises.mkdir(extractionDir, { recursive: true })
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractionDir }))
      .promise()
  } catch (error) {
    console.error('Failed to extract ZIP file:', error)
    throw error
  }
}

function updateLocalFiles(sourceDir: string, targetDir: string) {
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // 读取源目录的文件和子目录
  const sourceFiles = fs.readdirSync(sourceDir)

  // 处理源目录中的每个文件/目录
  sourceFiles.forEach(file => {
    const sourceFilePath = path.join(sourceDir, file)
    const targetFilePath = path.join(targetDir, file)

    if (fs.lstatSync(sourceFilePath).isFile()) {
      // 复制文件
      fs.copyFileSync(sourceFilePath, targetFilePath)
    } else if (fs.lstatSync(sourceFilePath).isDirectory()) {
      // 递归处理子目录
      updateLocalFiles(sourceFilePath, targetFilePath)
    }
  })

  // 删除目标目录中不存在于源目录的文件/目录
  const targetFiles = fs.readdirSync(targetDir)
  targetFiles.forEach(file => {
    const targetFilePath = path.join(targetDir, file)
    const sourceFilePath = path.join(sourceDir, file)

    if (!sourceFiles.includes(file)) {
      // 如果目标目录有而源目录没有，删除
      if (fs.lstatSync(targetFilePath).isFile()) {
        fs.unlinkSync(targetFilePath)
      } else if (fs.lstatSync(targetFilePath).isDirectory()) {
        fs.rmSync(targetFilePath, { recursive: true, force: true })
      }
    }
  })
}

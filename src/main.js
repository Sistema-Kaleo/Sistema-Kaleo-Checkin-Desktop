'use strict'

const { app, BrowserWindow, ipcMain, session, Menu, dialog, safeStorage } = require('electron')
const path = require('node:path')
const { createStore } = require('./store')
const { createPairingKeeper } = require('./pairing')
const {
  isAllowedUrl,
  isPairedKioskPath,
  validatePageSizeMm,
  mmToMicrons,
} = require('./print-utils')

// Kaleo Checkin Desktop — casca do totem com impressão silenciosa.
//  · abre o totem do Kaleo em tela cheia e não deixa a janela sair do domínio dele;
//  · logo após o pareamento, pede a impressora do Windows que este computador usa;
//  · expõe ao totem a ponte `window.kaleoDesktop.print` (driver `desktop` do Kaleo), que imprime
//    em silêncio nessa impressora e informa se deu certo.

const START_URL = process.env.KALEO_URL || 'https://sistemakaleo.com.br/kiosk/parear'
const ALLOWED_ORIGIN = new URL(START_URL).origin
const SMOKE = process.env.KALEO_SMOKE === '1'

let mainWindow = null
let pickerWindow = null
let store = null
let pairing = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(start)
  app.on('window-all-closed', () => app.quit())
}

async function start() {
  store = createStore(app.getPath('userData'))
  Menu.setApplicationMenu(null)
  lockDownSession()
  registerIpc()
  applyAutoStart()
  await keepPairing()
  createMainWindow()
  if (app.isPackaged && !SMOKE) require('./updater').startAutoUpdate()
}

/** Fechar a janela (Alt+F4, por engano) é ignorado; só sai por Ctrl+Shift+Q ou ao desligar o Windows. */
const GUARD_CLOSE = !process.argv.includes('--windowed')
let quitting = false
app.on('before-quit', () => {
  quitting = true
  // Garante que o cookie do pareamento chegue ao disco antes de sair.
  void session.defaultSession.cookies.flushStore().catch(() => {})
})

/**
 * O pareamento do totem é um cookie; reiniciar o Windows de repente podia perdê-lo. Mantém uma cópia
 * cifrada e recria o cookie se ele sumir (ver `pairing.js`). Falha aqui nunca impede o totem de abrir.
 */
async function keepPairing() {
  try {
    pairing = createPairingKeeper({
      session: session.defaultSession,
      store,
      safeStorage,
      origin: ALLOWED_ORIGIN,
      log: (msg) => console.log('[kaleo-desktop]', msg),
    })
    await pairing.restore()
    pairing.watch()
    await pairing.capture()
  } catch (err) {
    console.log('[kaleo-desktop] pareamento: não foi possível guardar a cópia local:', String(err))
  }
}

/** Abre o totem sozinho quando o Windows liga (só no app instalado; padrão: ligado). */
function applyAutoStart() {
  if (!app.isPackaged || SMOKE) return
  app.setLoginItemSettings({ openAtLogin: store.load().autoStart !== false })
}

function confirmQuit() {
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Sair do aplicativo', 'Continuar no totem'],
    defaultId: 1,
    cancelId: 1,
    title: 'Kaleo Checkin Desktop',
    message: 'Fechar o Kaleo Checkin Desktop?',
    detail: 'Enquanto estiver fechado, este computador não registra presenças.',
  })
  if (choice === 0) app.quit()
}

/** Só o domínio do Kaleo recebe permissões (a câmera do totem precisa de `media`). */
function lockDownSession() {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details && details.requestingUrl ? details.requestingUrl : wc.getURL()
    callback(permission === 'media' && isAllowedUrl(url, ALLOWED_ORIGIN))
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Kaleo Checkin Desktop',
    autoHideMenuBar: true,
    // Tela cheia por padrão (totem). `--windowed` abre em janela, para desenvolvimento.
    fullscreen: !process.argv.includes('--windowed'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const wc = mainWindow.webContents

  mainWindow.on('close', (event) => {
    if (GUARD_CLOSE && !quitting) event.preventDefault()
  })
  // Windows desligando ou encerrando a sessão: não pode ficar preso à janela.
  mainWindow.on('session-end', () => {
    quitting = true
  })

  // Nada de abrir outras janelas nem sair do domínio do Kaleo.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url, ALLOWED_ORIGIN)) event.preventDefault()
  })

  // Pareou (ou já estava pareado) e este computador ainda não tem impressora: pergunta agora.
  const onNavigated = (_event, url) => {
    let pathname = ''
    try {
      pathname = new URL(url).pathname
    } catch {
      return
    }
    if (isPairedKioskPath(pathname)) void ensurePrinterChosen()
  }
  // Sem internet ao abrir (ou ao recarregar): tenta de novo sozinho, em vez de ficar na página de erro.
  wc.on('did-fail-load', (_event, code, _desc, failedUrl, isMainFrame) => {
    if (SMOKE || !isMainFrame || code === -3) return // -3 = navegação cancelada de propósito
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      void wc.loadURL(isAllowedUrl(failedUrl, ALLOWED_ORIGIN) ? failedUrl : START_URL)
    }, 10000)
  })
  wc.on('did-navigate', onNavigated)
  wc.on('did-navigate-in-page', onNavigated)

  // Atalhos (a janela não tem menu): F5 recarrega, F11 alterna a tela cheia, Ctrl+Shift+P troca a impressora.
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F5') {
      wc.reload()
      event.preventDefault()
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    } else if (input.control && input.shift && input.key.toLowerCase() === 'p') {
      openPrinterPicker()
      event.preventDefault()
    } else if (input.control && input.shift && input.key.toLowerCase() === 'q') {
      confirmQuit()
      event.preventDefault()
    }
  })

  if (SMOKE) runSmoke(wc)

  void mainWindow.loadURL(START_URL)
}

/** Teste automático de fumaça (sem impressora): confirma que a ponte foi injetada. */
function runSmoke(wc) {
  wc.once('did-finish-load', async () => {
    try {
      const result = await wc.executeJavaScript(
        `({ bridge: typeof window.kaleoDesktop, patched: window.__kaleoDesktopPatched === true, url: location.href })`,
      )
      // Confere que a biblioteca de atualização foi empacotada junto (o pnpm pode deixá-la de fora).
      result.updater = typeof require('./updater').startAutoUpdate
      console.log('[smoke]', JSON.stringify(result))
      // O .exe instalado não tem console: o resultado também pode ir para um arquivo.
      if (process.env.KALEO_SMOKE_OUT) require('node:fs').writeFileSync(process.env.KALEO_SMOKE_OUT, JSON.stringify(result))
    } catch (err) {
      console.log('[smoke] erro:', String(err))
    }
    app.quit()
  })
  wc.once('did-fail-load', (_e, code, desc) => {
    console.log('[smoke] falha ao carregar:', code, desc)
    app.quit()
  })
}

async function listPrinters() {
  if (!mainWindow) return []
  return mainWindow.webContents.getPrintersAsync()
}

async function ensurePrinterChosen() {
  const saved = store.load().printerName
  if (saved) {
    const printers = await listPrinters()
    if (printers.some((p) => p.name === saved)) return
  }
  openPrinterPicker()
}

function openPrinterPicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.focus()
    return
  }
  pickerWindow = new BrowserWindow({
    width: 480,
    height: 560,
    parent: mainWindow,
    modal: true,
    title: 'Impressora deste computador',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  pickerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  void pickerWindow.loadFile(path.join(__dirname, 'picker.html'))
  pickerWindow.on('closed', () => {
    pickerWindow = null
  })
}

function registerIpc() {
  // --- Escolha da impressora (só a janela de escolha pode chamar) ---
  ipcMain.handle('picker:list', async (event) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents) return []
    const printers = await listPrinters()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault }))
  })

  ipcMain.handle('picker:get-autostart', (event) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents) return true
    return store.load().autoStart !== false
  })

  ipcMain.handle('picker:set-autostart', (event, enabled) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents) return false
    store.save({ autoStart: enabled === true })
    applyAutoStart()
    return true
  })

  ipcMain.handle('picker:choose', async (event, name) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents) return false
    const printers = await listPrinters()
    if (typeof name !== 'string' || !printers.some((p) => p.name === name)) return false
    store.save({ printerName: name })
    console.log('[kaleo-desktop] impressora escolhida:', name)
    pickerWindow.close()
    return true
  })

  // --- Impressão silenciosa (só a janela do totem, no domínio do Kaleo) ---
  ipcMain.handle('print:silent', async (event, size) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'origem_invalida' }
    const senderUrl = event.senderFrame ? event.senderFrame.url : ''
    if (!isAllowedUrl(senderUrl, ALLOWED_ORIGIN)) return { ok: false, error: 'origem_invalida' }
    if (!validatePageSizeMm(size)) return { ok: false, error: 'tamanho_invalido' }

    const printerName = store.load().printerName
    if (!printerName) {
      openPrinterPicker()
      return { ok: false, error: 'sem_impressora' }
    }

    const t0 = Date.now()
    return new Promise((resolve) => {
      mainWindow.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: { width: mmToMicrons(size.widthMm), height: mmToMicrons(size.heightMm) },
        },
        (success, failureReason) => {
          const ms = Date.now() - t0
          console.log(
            `[kaleo-desktop] impressão ${success ? 'enviada' : 'FALHOU'} em ${ms} ms` +
              ` (${size.widthMm}x${size.heightMm} mm, ${printerName})` +
              (success ? '' : ` — ${failureReason}`),
          )
          resolve(success ? { ok: true, ms } : { ok: false, error: failureReason || 'falha' })
        },
      )
    })
  })
}

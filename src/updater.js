'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')
const { shouldInstallNow, staleCacheEntries, updaterCacheDir } = require('./update-utils')

// Atualização automática pelo GitHub Releases (configurado em `build.publish` do package.json).
//  · confere ao abrir e a cada 4 horas; o download é em segundo plano;
//  · INSTALA só na janela da madrugada (3h–5h, ver update-utils.js) ou quando o app for fechado,
//    para nunca reiniciar o totem no meio de um culto;
//  · erro de rede ou ausência de versão nova só vai para o log (arquivo `update.log` na pasta de dados),
//    nunca para a tela;
//  · "Ctrl+Shift+U" (manualCheck) confere na hora e deixa o operador instalar agora — para suporte e testes;
//  · depois de atualizado, apaga do cache do updater o instalador e o download já usados (~240 MB).

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const INSTALL_POLL_EVERY_MS = 10 * 60 * 1000

let downloadedVersion = null
let logger = console.log

function startAutoUpdate(log = console.log) {
  logger = log

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => log('[update] versão nova encontrada:', info.version))
  autoUpdater.on('update-not-available', () => {
    log('[update] já está na versão mais recente')
    cleanStaleCache(log)
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    log('[update] versão', info.version, 'baixada; instala na madrugada ou ao fechar o app')
  })
  autoUpdater.on('error', (err) => log('[update] erro:', err && err.message ? err.message : String(err)))

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => log('[update] falha ao conferir:', err && err.message))
  }
  log('[update] iniciado; versão instalada', require('electron').app.getVersion())
  check()
  setInterval(check, CHECK_EVERY_MS)

  // QA: com KALEO_UPDATE_NOW=1 instala assim que baixa, sem esperar a madrugada.
  const installAsap = process.env.KALEO_UPDATE_NOW === '1'
  setInterval(() => {
    const downloaded = downloadedVersion !== null
    if (installAsap ? downloaded : shouldInstallNow({ downloaded, now: new Date() })) {
      log('[update] instalando a versão baixada')
      // silencioso e reabre o app depois; o `before-quit` do main libera o fechamento.
      autoUpdater.quitAndInstall(true, true)
    }
  }, INSTALL_POLL_EVERY_MS)
}

/**
 * Apaga do cache do updater (`%LOCALAPPDATA%\kaleo-checkin-desktop-updater`) o que sobrou de uma atualização
 * já instalada: o instalador (`installer.exe`) e o download pendente (`pending`). Só chamada quando o app
 * acabou de confirmar que está na versão mais recente (nada pendente). Falha (arquivo em uso) é ignorada:
 * tenta de novo na próxima conferência.
 */
function cleanStaleCache(log) {
  try {
    const dir = updaterCacheDir(process.env.LOCALAPPDATA)
    if (!dir || !fs.existsSync(dir)) return
    let freed = 0
    for (const name of staleCacheEntries()) {
      const target = path.join(dir, name)
      if (!fs.existsSync(target)) continue
      try {
        freed += sizeOf(target)
        fs.rmSync(target, { recursive: true, force: true })
      } catch (err) {
        log('[update] não foi possível limpar', name, '-', err && err.message)
      }
    }
    if (freed > 0) log('[update] cache limpo:', Math.round(freed / 1024 / 1024), 'MB liberados')
  } catch (err) {
    log('[update] limpeza do cache falhou:', err && err.message)
  }
}

function sizeOf(target) {
  const stat = fs.statSync(target)
  if (!stat.isDirectory()) return stat.size
  return fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0)
}

/**
 * Ctrl+Shift+U: confere agora e conta o resultado numa janela. Se já baixou, oferece instalar agora
 * (reinicia o totem) ou deixar para a madrugada/fechamento. Só no app instalado.
 */
async function manualCheck(parentWindow) {
  const { app, dialog } = require('electron')
  const title = 'Kaleo Checkin Desktop'
  const current = app.getVersion()
  const show = (options) =>
    dialog.showMessageBox(parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined, { type: 'info', title, ...options })

  if (!app.isPackaged) {
    await show({ message: `Versão ${current} (desenvolvimento)`, detail: 'A atualização automática só existe no aplicativo instalado.', buttons: ['OK'] })
    return
  }

  let result
  try {
    result = await autoUpdater.checkForUpdates()
  } catch (err) {
    logger('[update] conferência manual falhou:', err && err.message)
    await show({
      type: 'warning',
      message: `Versão instalada: ${current}`,
      detail: 'Não foi possível conferir se há versão nova. Verifique a internet deste computador e tente de novo.',
      buttons: ['OK'],
    })
    return
  }

  const latest = result && result.updateInfo ? result.updateInfo.version : null
  if (!result || !result.isUpdateAvailable) {
    await show({ message: `Versão instalada: ${current}`, detail: 'Este computador já está na versão mais recente.', buttons: ['OK'] })
    return
  }

  if (downloadedVersion === null) {
    await show({
      message: `Versão nova encontrada: ${latest}`,
      detail: 'Está sendo baixada em segundo plano. Quando terminar, ela instala sozinha na madrugada (3h às 5h) ou ao fechar o aplicativo. Para instalar na hora, use Ctrl+Shift+U de novo depois do download.',
      buttons: ['OK'],
    })
    return
  }

  const choice = await show({
    type: 'question',
    message: `Versão ${downloadedVersion} pronta para instalar`,
    detail: `Instalada hoje: ${current}. Instalar agora reinicia o totem e ele não registra presenças por alguns segundos.`,
    buttons: ['Instalar agora', 'Deixar para a madrugada'],
    defaultId: 1,
    cancelId: 1,
  })
  if (choice.response === 0) {
    logger('[update] instalação manual da versão', downloadedVersion)
    autoUpdater.quitAndInstall(true, true)
  }
}

module.exports = { startAutoUpdate, manualCheck, cleanStaleCache }

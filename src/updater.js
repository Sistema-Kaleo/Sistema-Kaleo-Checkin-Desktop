'use strict'

const { autoUpdater } = require('electron-updater')
const { shouldInstallNow } = require('./update-utils')

// Atualização automática pelo GitHub Releases (configurado em `build.publish` do package.json).
//  · confere ao abrir e a cada 4 horas; o download é em segundo plano;
//  · INSTALA só na janela da madrugada (3h–5h, ver update-utils.js) ou quando o app for fechado,
//    para nunca reiniciar o totem no meio de um culto;
//  · erro de rede ou ausência de versão nova só vai para o log, nunca para a tela.

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const INSTALL_POLL_EVERY_MS = 10 * 60 * 1000

function startAutoUpdate(log = console.log) {
  let downloaded = false

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => log('[update] versão nova encontrada:', info.version))
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    log('[update] versão', info.version, 'baixada; instala na madrugada ou ao fechar o app')
  })
  autoUpdater.on('error', (err) => log('[update] erro:', err && err.message ? err.message : String(err)))

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => log('[update] falha ao conferir:', err && err.message))
  }
  check()
  setInterval(check, CHECK_EVERY_MS)

  // QA: com KALEO_UPDATE_NOW=1 instala assim que baixa, sem esperar a madrugada.
  const installAsap = process.env.KALEO_UPDATE_NOW === '1'
  setInterval(() => {
    if (installAsap ? downloaded : shouldInstallNow({ downloaded, now: new Date() })) {
      log('[update] instalando a versão baixada')
      // silencioso e reabre o app depois; o `before-quit` do main libera o fechamento.
      autoUpdater.quitAndInstall(true, true)
    }
  }, INSTALL_POLL_EVERY_MS)
}

module.exports = { startAutoUpdate }

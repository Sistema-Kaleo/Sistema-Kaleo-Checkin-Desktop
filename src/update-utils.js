'use strict'

// Regras puras da atualização automática (sem Electron), testáveis com `node --test`.
//
// O totem fica ligado o dia todo; reiniciar para instalar no meio de um culto derrubaria o
// check-in. Por isso a versão nova só é INSTALADA numa janela de madrugada (ou quando o
// aplicativo for fechado). O download acontece em segundo plano a qualquer hora.

/** Janela de instalação: de 3h00 até 4h59 do horário do computador. */
const INSTALL_WINDOW_START_HOUR = 3
const INSTALL_WINDOW_END_HOUR = 5

function isInstallWindow(date) {
  const hour = date.getHours()
  return hour >= INSTALL_WINDOW_START_HOUR && hour < INSTALL_WINDOW_END_HOUR
}

/** Instala agora só se já baixou e está na janela de madrugada. */
function shouldInstallNow({ downloaded, now }) {
  return downloaded === true && isInstallWindow(now)
}

// ── Cache do updater ────────────────────────────────────────────────────────
//
// O electron-updater guarda o instalador baixado em `%LOCALAPPDATA%\<updaterCacheDirName>` (o nome vem do
// `app-update.yml` gerado no build) e NÃO apaga o `installer.exe` nem o `pending\` depois de instalar:
// ficam ~240 MB parados por computador. `current.blockmap` fica (é pequeno e acelera a próxima atualização).

/** Mesmo valor de `updaterCacheDirName` no app-update.yml do instalador. */
const UPDATER_CACHE_DIR_NAME = 'kaleo-checkin-desktop-updater'

/** Pasta do cache do updater, ou null sem LOCALAPPDATA (nunca adivinha um caminho). */
function updaterCacheDir(localAppData) {
  if (typeof localAppData !== 'string' || localAppData.trim() === '') return null
  return require('node:path').join(localAppData, UPDATER_CACHE_DIR_NAME)
}

/** O que sobra de uma atualização já instalada e pode ser apagado. */
function staleCacheEntries() {
  return ['installer.exe', 'pending']
}

// ── Registro (update.log) ───────────────────────────────────────────────────

const LOG_MAX_CHARS = 200_000
const LOG_KEEP_CHARS = 100_000

/** Uma linha do registro: data ISO + mensagem. Nunca lança (argumento estranho vira texto). */
function formatLogLine(date, args) {
  const text = args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
  return `${date.toISOString()} ${text}\n`
}

/** Mantém o registro pequeno: passando do limite, guarda só o final (cortando na quebra de linha). */
function trimLogText(text, max = LOG_MAX_CHARS, keep = LOG_KEEP_CHARS) {
  if (text.length <= max) return text
  const tail = text.slice(text.length - keep)
  const newline = tail.indexOf('\n')
  return newline >= 0 ? tail.slice(newline + 1) : tail
}

module.exports = {
  INSTALL_WINDOW_START_HOUR,
  INSTALL_WINDOW_END_HOUR,
  UPDATER_CACHE_DIR_NAME,
  isInstallWindow,
  shouldInstallNow,
  updaterCacheDir,
  staleCacheEntries,
  formatLogLine,
  trimLogText,
}

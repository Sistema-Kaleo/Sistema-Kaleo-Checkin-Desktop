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

module.exports = {
  INSTALL_WINDOW_START_HOUR,
  INSTALL_WINDOW_END_HOUR,
  isInstallWindow,
  shouldInstallNow,
}

'use strict'

const fs = require('node:fs')
const { formatLogLine, trimLogText } = require('./update-utils')

// Registro da atualização em arquivo (`update.log` na pasta de dados do app). O app instalado não tem
// console, então sem isto ninguém sabe por que uma atualização não aconteceu. Só mensagens técnicas da
// atualização: nunca dado de igreja, de pessoa nem token.

function createFileLogger(filePath) {
  return (...args) => {
    const line = formatLogLine(new Date(), args)
    console.log(line.trimEnd())
    try {
      let current = ''
      try {
        current = fs.readFileSync(filePath, 'utf8')
      } catch {
        /* primeiro registro */
      }
      fs.writeFileSync(filePath, trimLogText(current + line), 'utf8')
    } catch {
      /* registrar nunca derruba o app */
    }
  }
}

module.exports = { createFileLogger }

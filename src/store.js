'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Configuração LOCAL do computador (qual impressora do Windows este totem usa).
// Fica na pasta de dados do app, nunca no Kaleo: é um fato desta máquina.

function createStore(dir) {
  const file = path.join(dir, 'settings.json')

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  function save(patch) {
    const next = { ...load(), ...patch }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  return { load, save }
}

module.exports = { createStore }

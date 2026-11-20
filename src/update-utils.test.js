'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isInstallWindow, shouldInstallNow } = require('./update-utils')

const at = (h, m = 0) => new Date(2026, 10, 20, h, m, 0)

test('janela de instalação: 3h00 até 4h59', () => {
  assert.equal(isInstallWindow(at(2, 59)), false)
  assert.equal(isInstallWindow(at(3, 0)), true)
  assert.equal(isInstallWindow(at(4, 59)), true)
  assert.equal(isInstallWindow(at(5, 0)), false)
  assert.equal(isInstallWindow(at(10, 0)), false) // horário de culto
  assert.equal(isInstallWindow(at(0, 0)), false)
})

test('só instala se já baixou e está na janela', () => {
  assert.equal(shouldInstallNow({ downloaded: true, now: at(3, 30) }), true)
  assert.equal(shouldInstallNow({ downloaded: false, now: at(3, 30) }), false)
  assert.equal(shouldInstallNow({ downloaded: true, now: at(11, 0) }), false)
  assert.equal(shouldInstallNow({ downloaded: undefined, now: at(3, 30) }), false)
})

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

const {
  UPDATER_CACHE_DIR_NAME,
  updaterCacheDir,
  staleCacheEntries,
  formatLogLine,
  trimLogText,
} = require('./update-utils')

test('cache do updater: pasta fixa dentro do LOCALAPPDATA; sem a variável, nunca adivinha', () => {
  const dir = updaterCacheDir('C:\Users\Ana\AppData\Local')
  assert.ok(dir.endsWith(UPDATER_CACHE_DIR_NAME))
  assert.ok(dir.includes('Ana'))
  assert.equal(updaterCacheDir(undefined), null)
  assert.equal(updaterCacheDir('  '), null)
})

test('só o instalador e o download pendente são lixo; o blockmap fica', () => {
  assert.deepEqual(staleCacheEntries(), ['installer.exe', 'pending'])
  assert.ok(!staleCacheEntries().includes('current.blockmap'))
})

test('linha do registro: data ISO e texto; erro e objeto não derrubam', () => {
  const d = new Date('2026-11-23T12:00:00.000Z')
  assert.equal(formatLogLine(d, ['[update]', 'versão', '0.4.3']), '2026-11-23T12:00:00.000Z [update] versão 0.4.3\n')
  assert.match(formatLogLine(d, [new Error('sem rede')]), /sem rede/)
  assert.match(formatLogLine(d, [{ a: 1 }]), /{"a":1}/)
  const circular = {}
  circular.self = circular
  assert.doesNotThrow(() => formatLogLine(d, [circular]))
})

test('o registro não cresce sem fim: guarda o final, começando numa linha inteira', () => {
  assert.equal(trimLogText('curto\n', 100, 50), 'curto\n')
  const text = Array.from({ length: 50 }, (_, i) => `linha ${i}\n`).join('')
  const out = trimLogText(text, 100, 60)
  assert.ok(out.length <= 60)
  assert.ok(out.endsWith('linha 49\n'))
  assert.match(out, /^linha \d+\n/)
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isAllowedUrl,
  isPairedKioskPath,
  parsePageSizeMm,
  validatePageSizeMm,
  mmToMicrons,
} = require('./print-utils')

test('isAllowedUrl só aceita a mesma origem', () => {
  const origin = 'https://sistemakaleo.com.br'
  assert.equal(isAllowedUrl('https://sistemakaleo.com.br/kiosk/checkin', origin), true)
  assert.equal(isAllowedUrl('https://outro-site.com/kiosk/checkin', origin), false)
  assert.equal(isAllowedUrl('http://sistemakaleo.com.br/kiosk/checkin', origin), false)
  assert.equal(isAllowedUrl('https://sistemakaleo.com.br.evil.com/', origin), false)
  assert.equal(isAllowedUrl('nao-e-url', origin), false)
})

test('isPairedKioskPath: só depois do pareamento', () => {
  assert.equal(isPairedKioskPath('/kiosk/checkin'), true)
  assert.equal(isPairedKioskPath('/kiosk/checkin/abc-123'), true)
  assert.equal(isPairedKioskPath('/kiosk/parear'), false)
  assert.equal(isPairedKioskPath('/kiosk/desconectado'), false)
  assert.equal(isPairedKioskPath('/kiosk/session-expired'), false)
  assert.equal(isPairedKioskPath('/admin'), false)
  assert.equal(isPairedKioskPath(undefined), false)
})

test('parsePageSizeMm lê o @page do totem', () => {
  const css = '@page { size: 29mm 90mm; margin: 0; } #x { display: none; }'
  assert.deepEqual(parsePageSizeMm(css), { widthMm: 29, heightMm: 90 })
  assert.deepEqual(parsePageSizeMm('@page{size:62.5mm 100mm}'), { widthMm: 62.5, heightMm: 100 })
  assert.equal(parsePageSizeMm('body { color: red }'), null)
  assert.equal(parsePageSizeMm(null), null)
})

test('validatePageSizeMm respeita os limites do cadastro', () => {
  assert.equal(validatePageSizeMm({ widthMm: 29, heightMm: 90 }), true)
  assert.equal(validatePageSizeMm({ widthMm: 19.9, heightMm: 90 }), false)
  assert.equal(validatePageSizeMm({ widthMm: 29, heightMm: 301 }), false)
  assert.equal(validatePageSizeMm({ widthMm: '29', heightMm: 90 }), false)
  assert.equal(validatePageSizeMm({ widthMm: NaN, heightMm: 90 }), false)
  assert.equal(validatePageSizeMm(null), false)
})

test('mmToMicrons', () => {
  assert.equal(mmToMicrons(29), 29000)
  assert.equal(mmToMicrons(62.5), 62500)
})

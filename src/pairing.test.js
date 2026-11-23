'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  COOKIE_NAME,
  isValidToken,
  shouldForgetOnRemoval,
  buildCookieDetails,
  createPairingKeeper,
} = require('./pairing')

const ORIGIN = 'https://sistemakaleo.com.br'
const TOKEN = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function fakeEnv({ available = true, saved = {} } = {}) {
  const jar = new Map()
  const listeners = []
  let flushes = 0
  const data = { ...saved }
  return {
    jar,
    flushes: () => flushes,
    data,
    emit: (cookie, cause, removed) => listeners.forEach((l) => l({}, cookie, cause, removed)),
    session: {
      cookies: {
        get: async () => (jar.has(COOKIE_NAME) ? [{ name: COOKIE_NAME, value: jar.get(COOKIE_NAME) }] : []),
        set: async (details) => void jar.set(details.name, details.value),
        flushStore: async () => void (flushes += 1),
        on: (_event, listener) => void listeners.push(listener),
      },
    },
    store: {
      load: () => ({ ...data }),
      save: (patch) => {
        Object.assign(data, patch)
        return { ...data }
      },
    },
    // "Cifra" de brinquedo: prefixo reversível, só para o teste.
    safeStorage: {
      isEncryptionAvailable: () => available,
      encryptString: (s) => Buffer.from('enc:' + s),
      decryptString: (b) => {
        const text = b.toString()
        if (!text.startsWith('enc:')) throw new Error('inválido')
        return text.slice(4)
      },
    },
  }
}

function keeperFor(env) {
  return createPairingKeeper({ session: env.session, store: env.store, safeStorage: env.safeStorage, origin: ORIGIN, now: () => 1_000_000_000_000 })
}

test('isValidToken só aceita 64 caracteres hexadecimais', () => {
  assert.equal(isValidToken(TOKEN), true)
  assert.equal(isValidToken('xyz'), false)
  assert.equal(isValidToken(null), false)
})

test('shouldForgetOnRemoval: apagar esquece; renovar e limpeza do Chromium não', () => {
  assert.equal(shouldForgetOnRemoval('explicit'), true)
  assert.equal(shouldForgetOnRemoval('expired-overwrite'), true)
  assert.equal(shouldForgetOnRemoval('overwrite'), false)
  assert.equal(shouldForgetOnRemoval('evicted'), false)
})

test('buildCookieDetails espelha o cookie do Kaleo (HttpOnly, Strict, 400 dias)', () => {
  const d = buildCookieDetails(ORIGIN, TOKEN, 1_000_000_000_000)
  assert.equal(d.httpOnly, true)
  assert.equal(d.secure, true)
  assert.equal(d.sameSite, 'strict')
  assert.equal(d.expirationDate, 1_000_000_000 + 400 * 24 * 60 * 60)
  assert.equal(buildCookieDetails('http://localhost:3000', TOKEN, 0).secure, false)
})

test('capture guarda a cópia cifrada (nunca o token puro) e força a gravação em disco', async () => {
  const env = fakeEnv()
  env.jar.set(COOKIE_NAME, TOKEN)
  await keeperFor(env).capture()
  assert.ok(env.data.pairing)
  assert.ok(!JSON.stringify(env.data).includes(TOKEN))
  assert.equal(env.data.pairingOrigin, ORIGIN)
  assert.equal(env.flushes(), 1)
})

test('restore recria o cookie que sumiu depois de reiniciar o Windows', async () => {
  const env = fakeEnv()
  env.jar.set(COOKIE_NAME, TOKEN)
  await keeperFor(env).capture()
  env.jar.clear() // o Chromium perdeu o cookie
  assert.equal(await keeperFor(env).restore(), true)
  assert.equal(env.jar.get(COOKIE_NAME), TOKEN)
})

test('restore não mexe num cookie que já existe', async () => {
  const env = fakeEnv()
  env.jar.set(COOKIE_NAME, TOKEN)
  await keeperFor(env).capture()
  env.jar.set(COOKIE_NAME, OTHER)
  assert.equal(await keeperFor(env).restore(), false)
  assert.equal(env.jar.get(COOKIE_NAME), OTHER)
})

test('restore ignora cópia de outra origem e sem cifra disponível', async () => {
  const env = fakeEnv()
  env.jar.set(COOKIE_NAME, TOKEN)
  await keeperFor(env).capture()
  env.jar.clear()
  env.data.pairingOrigin = 'http://localhost:3000'
  assert.equal(await keeperFor(env).restore(), false)

  const semCifra = fakeEnv({ available: false })
  semCifra.jar.set(COOKIE_NAME, TOKEN)
  await keeperFor(semCifra).capture()
  assert.equal(semCifra.data.pairing, undefined)
})

test('watch: o Kaleo apagar o cookie (desparear) esquece a cópia; renovar não', async () => {
  const env = fakeEnv()
  const keeper = keeperFor(env)
  keeper.watch()
  env.jar.set(COOKIE_NAME, TOKEN)
  env.emit({ name: COOKIE_NAME, value: TOKEN }, 'inserted', false)
  await new Promise((r) => setImmediate(r))
  assert.ok(env.data.pairing)

  env.emit({ name: COOKIE_NAME, value: TOKEN }, 'overwrite', true)
  assert.ok(env.data.pairing)

  env.emit({ name: COOKIE_NAME, value: TOKEN }, 'expired-overwrite', true)
  assert.equal(env.data.pairing, null)
  env.jar.clear()
  assert.equal(await keeper.restore(), false)
})

test('watch ignora outros cookies', async () => {
  const env = fakeEnv()
  keeperFor(env).watch()
  env.emit({ name: 'outro', value: 'x' }, 'explicit', true)
  assert.equal(env.data.pairing, undefined)
})

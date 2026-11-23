'use strict'

// Guarda do pareamento do totem neste computador.
//
// O pareamento do Kaleo é um cookie HttpOnly (`sgc_kiosk_device`) que o Chromium guarda em disco com
// atraso e só de forma garantida ao fechar limpo. Reiniciar ou desligar o Windows de repente podia
// perdê-lo, e o totem pedia para parear de novo. Aqui o app mantém uma CÓPIA do valor, cifrada pelo
// Windows (DPAPI, via `safeStorage`: o mesmo nível de proteção que o Chromium dá ao cookie), na pasta de
// dados do app, e recria o cookie na abertura se ele tiver sumido.
//
// Quando o Kaleo APAGA o cookie (desparear no tablet), a cópia é apagada junto: nunca se ressuscita um
// pareamento desfeito de propósito. A validade real continua sendo do servidor (revogado = desconectado).

const COOKIE_NAME = 'sgc_kiosk_device'
const TOKEN_FORMAT = /^[0-9a-f]{64}$/
/** Mesmo teto do Chrome (e do cookie original do Kaleo). */
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

/** Remoções que significam "o Kaleo apagou o cookie". `overwrite` (renovação) e `evicted` (limpeza do Chromium) não. */
const DELETE_CAUSES = new Set(['explicit', 'expired', 'expired-overwrite'])

function isValidToken(value) {
  return typeof value === 'string' && TOKEN_FORMAT.test(value)
}

function shouldForgetOnRemoval(cause) {
  return DELETE_CAUSES.has(cause)
}

/** Cookie igual ao que o servidor do Kaleo cria: host-only, HttpOnly, SameSite=Strict, Secure em https. */
function buildCookieDetails(origin, value, nowMs) {
  return {
    url: origin,
    name: COOKIE_NAME,
    value,
    path: '/',
    httpOnly: true,
    secure: origin.startsWith('https:'),
    sameSite: 'strict',
    expirationDate: Math.floor(nowMs / 1000) + COOKIE_MAX_AGE_SECONDS,
  }
}

/**
 * @param {object} deps
 * @param {{ cookies: any }} deps.session        sessão do Electron (cookies.get/set/flushStore/on)
 * @param {{ load(): object, save(patch: object): object }} deps.store
 * @param {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string }} deps.safeStorage
 * @param {string} deps.origin                   origem do Kaleo (ex.: https://sistemakaleo.com.br)
 * @param {() => number} [deps.now]
 * @param {(msg: string) => void} [deps.log]
 */
function createPairingKeeper({ session, store, safeStorage, origin, now = Date.now, log = () => {} }) {
  const canEncrypt = () => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  function readSaved() {
    const saved = store.load()
    const encoded = saved.pairing
    // A cópia vale só para a origem em que foi feita (produção x servidor local de desenvolvimento).
    if (typeof encoded !== 'string' || !encoded || saved.pairingOrigin !== origin || !canEncrypt()) return null
    try {
      const value = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
      return isValidToken(value) ? value : null
    } catch {
      return null
    }
  }

  function save(value) {
    if (!canEncrypt()) return false
    store.save({ pairing: safeStorage.encryptString(value).toString('base64'), pairingOrigin: origin })
    return true
  }

  function forget() {
    if (store.load().pairing) store.save({ pairing: null, pairingOrigin: null })
  }

  async function currentCookieValue() {
    const found = await session.cookies.get({ url: origin, name: COOKIE_NAME })
    const value = found && found[0] ? found[0].value : null
    return isValidToken(value) ? value : null
  }

  /** Na abertura: se o cookie sumiu (ou nunca foi gravado) e há cópia, recria o cookie. */
  async function restore() {
    const saved = readSaved()
    if (!saved) return false
    if (await currentCookieValue()) return false
    await session.cookies.set(buildCookieDetails(origin, saved, now()))
    log('pareamento restaurado a partir da cópia local')
    return true
  }

  /** Guarda a cópia do cookie atual e força o Chromium a gravá-lo em disco agora. */
  async function capture() {
    const value = await currentCookieValue()
    if (!value) return false
    if (readSaved() !== value) save(value)
    await session.cookies.flushStore()
    return true
  }

  /** Acompanha as mudanças do cookie: guarda quando nasce/renova, esquece quando o Kaleo o apaga. */
  function watch() {
    session.cookies.on('changed', (_event, cookie, cause, removed) => {
      if (!cookie || cookie.name !== COOKIE_NAME) return
      if (removed) {
        if (shouldForgetOnRemoval(cause)) forget()
        return
      }
      void capture().catch(() => {})
    })
  }

  return { restore, capture, watch, forget }
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  isValidToken,
  shouldForgetOnRemoval,
  buildCookieDetails,
  createPairingKeeper,
}

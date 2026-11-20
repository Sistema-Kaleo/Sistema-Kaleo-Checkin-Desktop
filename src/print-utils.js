'use strict'

// Funções puras do app (sem Electron), para poderem ser testadas com `node --test`.

/** Limites iguais aos do cadastro de impressoras do Kaleo (PRINTER_LIMITS.paperMm). */
const PAPER_MM_MIN = 20
const PAPER_MM_MAX = 300

/** Só páginas da mesma origem do totem podem usar a ponte de impressão e navegar na janela. */
function isAllowedUrl(url, allowedOrigin) {
  try {
    return new URL(url).origin === allowedOrigin
  } catch {
    return false
  }
}

/** Telas do totem em que o aparelho já está pareado (hora de escolher a impressora do computador). */
function isPairedKioskPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/kiosk/')) return false
  return !/^\/kiosk\/(parear|desconectado|session-expired)(\/|$)/.test(pathname)
}

/** Lê "size: 29mm 90mm" do CSS @page que o totem gera para a etiqueta. */
function parsePageSizeMm(cssText) {
  if (typeof cssText !== 'string') return null
  const m = /size:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(cssText)
  if (!m) return null
  return { widthMm: Number(m[1]), heightMm: Number(m[2]) }
}

function validatePageSizeMm(size) {
  if (!size || typeof size !== 'object') return false
  const { widthMm, heightMm } = size
  return [widthMm, heightMm].every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= PAPER_MM_MIN && v <= PAPER_MM_MAX,
  )
}

/** O Electron recebe o tamanho do papel em micrômetros. */
function mmToMicrons(mm) {
  return Math.round(mm * 1000)
}

module.exports = {
  PAPER_MM_MIN,
  PAPER_MM_MAX,
  isAllowedUrl,
  isPairedKioskPath,
  parsePageSizeMm,
  validatePageSizeMm,
  mmToMicrons,
}

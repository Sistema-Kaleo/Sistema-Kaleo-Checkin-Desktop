'use strict'

// Leitura simples de um arquivo KEY=VALUE (sem dependências), para o script de publicação.

/** Lê linhas `CHAVE=valor`; ignora vazias e comentários (#); tira aspas simples/duplas ao redor. */
function parseEnvFile(text) {
  const out = {}
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

module.exports = { parseEnvFile }

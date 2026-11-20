'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseEnvFile } = require('./env-file')

test('lê chave=valor, ignora comentários e linhas vazias', () => {
  const env = parseEnvFile('# comentário\n\nGH_TOKEN=abc123\nOUTRA = valor com espaço \n')
  assert.deepEqual(env, { GH_TOKEN: 'abc123', OUTRA: 'valor com espaço' })
})

test('tira aspas ao redor e aceita CRLF', () => {
  assert.equal(parseEnvFile('GH_TOKEN="abc"\r\n').GH_TOKEN, 'abc')
  assert.equal(parseEnvFile("GH_TOKEN='abc'\r\n").GH_TOKEN, 'abc')
})

test('mantém "=" dentro do valor e ignora linha sem chave', () => {
  assert.equal(parseEnvFile('GH_TOKEN=a=b=c').GH_TOKEN, 'a=b=c')
  assert.deepEqual(parseEnvFile('=semchave\nsemigual'), {})
})

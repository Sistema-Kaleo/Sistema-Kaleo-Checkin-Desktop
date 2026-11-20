'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { releasePreflightProblem, releaseTag } = require('./release-checks')

test('tudo certo: sem alterações e o local igual ao remoto', () => {
  assert.equal(releasePreflightProblem({ dirty: false, headSha: 'abc', remoteSha: 'abc' }), null)
})

test('alterações não commitadas impedem a publicação', () => {
  assert.match(releasePreflightProblem({ dirty: true, headSha: 'abc', remoteSha: 'abc' }), /não commitadas/)
})

test('commit local diferente do main remoto (falta o push) impede a publicação', () => {
  assert.match(releasePreflightProblem({ dirty: false, headSha: 'abc', remoteSha: 'def' }), /git push/)
})

test('sem conseguir ler o remoto, não publica', () => {
  assert.match(releasePreflightProblem({ dirty: false, headSha: 'abc', remoteSha: null }), /main/)
})

test('a tag da versão', () => {
  assert.equal(releaseTag('0.4.1'), 'v0.4.1')
})

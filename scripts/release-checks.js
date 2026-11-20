'use strict'

// Conferências puras da publicação (sem rede nem git), testáveis com `node --test`.

/**
 * Devolve o motivo de NÃO publicar ou `null` se está tudo certo.
 *  - `dirty`: há alterações não commitadas (arquivos ignorados pelo git não contam);
 *  - `headSha`: commit local; `remoteSha`: commit de `main` no GitHub.
 * O GitHub cria a tag da versão a partir do `main` remoto: com alterações sem commit ou sem push, a
 * tag apontaria para o código antigo.
 */
function releasePreflightProblem({ dirty, headSha, remoteSha }) {
  if (dirty) {
    return 'Há alterações não commitadas. Faça o commit (e o push) antes de publicar, para a tag da versão apontar para o código certo.'
  }
  if (!remoteSha) {
    return 'Não consegui ler o `main` no GitHub. Confira a internet e o endereço em `build.publish`.'
  }
  if (headSha !== remoteSha) {
    return 'O commit local não é o mesmo do `main` no GitHub. Faça `git push` antes de publicar.'
  }
  return null
}

/** Tag do Release de uma versão. */
function releaseTag(version) {
  return `v${version}`
}

module.exports = { releasePreflightProblem, releaseTag }

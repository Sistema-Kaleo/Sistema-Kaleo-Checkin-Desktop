'use strict'

// Publica uma versão no GitHub Releases (`pnpm release`), lendo o token de `.release.env`
// (arquivo local, ignorado pelo git) para não precisar digitá-lo a cada vez.
//
// Segurança: o repositório é PÚBLICO. O script se recusa a rodar se o arquivo do token não
// estiver ignorado pelo git, para o token nunca ser commitado por engano.
//
// Antes de publicar ele confere que tudo está commitado e enviado (o GitHub cria a tag da versão
// a partir do `main` remoto) e CRIA o Release sozinho. O electron-builder envia os 3 arquivos em
// paralelo e, sem isso, as tentativas de criar o mesmo Release se atropelam (erro 422).
//
// `pnpm release -- --check` faz todas as conferências, sem criar nem publicar nada.

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { spawnSync } = require('node:child_process')
const { parseEnvFile } = require('./env-file')
const { releasePreflightProblem, releaseTag } = require('./release-checks')

const root = path.resolve(__dirname, '..')
const envFile = path.join(root, '.release.env')
const checkOnly = process.argv.includes('--check')
const pkg = require('../package.json')
const publish = (pkg.build && pkg.build.publish && pkg.build.publish[0]) || {}
const repoApi = `https://api.github.com/repos/${publish.owner}/${publish.repo}`
const tag = releaseTag(pkg.version)

function fail(message) {
  console.error(`\n[release] ${message}\n`)
  process.exit(1)
}

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' })
}

/** Chamada à API do GitHub com node:https e conexão não reutilizada (o fetch do Node deixa a conexão aberta e quebra a saída no Windows). */
function api(method, pathname, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kaleo-checkin-desktop-release',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (payload) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload)
    }
    const req = https.request(
      `${repoApi}${pathname}`,
      { method, headers, agent: false },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(data)
          } catch {
            json = null
          }
          resolve({ status: res.statusCode, json })
        })
      },
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function main() {
  if (!publish.owner || !publish.repo) fail('`build.publish` do package.json está incompleto (owner/repo).')

  // 1) Token (variável de ambiente ou .release.env protegido pelo git).
  let token = process.env.GH_TOKEN || ''
  if (!token) {
    if (!fs.existsSync(envFile)) {
      fail(
        'Token não encontrado. Copie `.release.env.example` para `.release.env` e cole o token do GitHub nele, ' +
          'ou defina $env:GH_TOKEN nesta janela.',
      )
    }
    // O arquivo existe: ele PRECISA estar ignorado pelo git (o repositório é público).
    if (git(['check-ignore', '-q', '.release.env']).status !== 0) {
      fail('`.release.env` NÃO está ignorado pelo git. Não vou usá-lo: adicione `.release.env` ao .gitignore primeiro.')
    }
    token = parseEnvFile(fs.readFileSync(envFile, 'utf8')).GH_TOKEN || ''
    if (!token || token.includes('cole-o-token')) {
      fail('`.release.env` não tem o GH_TOKEN preenchido (linha `GH_TOKEN=...`).')
    }
  }

  // 2) Tudo commitado e enviado? (arquivos ignorados pelo git, como o .release.env, não contam)
  const dirty = git(['status', '--porcelain']).stdout.trim().length > 0
  const headSha = git(['rev-parse', 'HEAD']).stdout.trim()
  const remote = await api('GET', '/commits/main')
  const remoteSha = remote.status === 200 && remote.json ? remote.json.sha : null
  const problem = releasePreflightProblem({ dirty, headSha, remoteSha })
  if (problem) fail(problem)

  // 3) O Release da versão já existe? (consulta pública, sem token)
  const existing = await api('GET', `/releases/tags/${tag}`)
  if (existing.status === 200) {
    const names = (existing.json.assets || []).map((a) => a.name).join(', ') || 'nenhum arquivo'
    console.log(`[release] O Release ${tag} já existe (${names}); vou completar os arquivos que faltam.`)
  } else if (existing.status === 404) {
    console.log(`[release] O Release ${tag} ainda não existe.`)
  } else {
    fail(`Não consegui consultar o Release ${tag} (HTTP ${existing.status}).`)
  }

  if (checkOnly) {
    console.log('[release] Conferências ok (token, proteção do arquivo, commit enviado). Nada foi publicado (--check).')
    return
  }

  // 4) Cria o Release antes do envio, para os 3 arquivos não competirem por criá-lo.
  if (existing.status === 404) {
    const created = await api('POST', '/releases', token, {
      tag_name: tag,
      target_commitish: 'main',
      name: pkg.version,
      draft: false,
      prerelease: false,
    })
    if (created.status !== 201) {
      fail(`Não consegui criar o Release ${tag} (HTTP ${created.status}): ${created.json && created.json.message}`)
    }
    console.log(`[release] Release ${tag} criado.`)
  }

  // 5) Gera o instalador e envia os arquivos para o Release.
  const builderCli = require.resolve('electron-builder/cli.js')
  const result = spawnSync(process.execPath, [builderCli, '--win', '--x64', '--publish', 'always'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, GH_TOKEN: token },
  })
  process.exitCode = result.status === null ? 1 : result.status
}

main().catch((err) => {
  const message = err instanceof ReleaseError ? err.message : `Erro inesperado: ${err && err.message ? err.message : String(err)}`
  console.error(`
[release] ${message}
`)
  process.exitCode = 1
})

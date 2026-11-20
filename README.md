# Kaleo Checkin Desktop

Casca desktop do totem de check-in do Kaleo, com **impressão silenciosa** de etiquetas (sem janela de impressão).

> Estado: **versão 0.4.0**. Instalador do Windows e atualização automática pelo GitHub Releases; **sem assinatura de código por enquanto** (fase de testes; decidir antes da implantação).

## Como rodar em desenvolvimento

```powershell
pnpm install
pnpm start -- --windowed
```

Se o `pnpm install` não baixar o binário do Electron: `node node_modules/electron/install.js`.

Para apontar para outro endereço (por exemplo o servidor local do Kaleo):

```powershell
$env:KALEO_URL = "http://localhost:3000/kiosk/parear"; pnpm start -- --windowed
```

## Como gerar o instalador (Windows)

```powershell
pnpm dist
```

Gera `dist\Kaleo-Checkin-Desktop-Setup-<versão>.exe` (instalação por usuário, sem pedir administrador, com atalho na área de trabalho e no menu Iniciar). Sem certificado configurado, a assinatura é ignorada e o Windows mostra o aviso do SmartScreen ("O Windows protegeu o computador"): clicar em "Mais informações" e "Executar assim mesmo". Para assinar, configurar o certificado no `electron-builder` antes de distribuir às igrejas.

Para subir a versão: alterar `version` no `package.json` e em `src/preload.js` (ponte).

## Como publicar uma versão e atualizar os totens

Os instaladores e as atualizações ficam no **GitHub Releases** do repositório público `danielmachado-sistemakaleo/Sistema-Kaleo-Checkin-Desktop` (configurado em `build.publish`).

1. Subir a `version` (package.json e `src/preload.js`) e commitar.
2. Criar um token do GitHub com permissão `repo` e, no PowerShell: `$env:GH_TOKEN = "<token>"; pnpm release`. Isso gera o instalador e publica o Release com os 3 arquivos que a atualização precisa (`.exe`, `.exe.blockmap` e `latest.yml`).
   - Sem token: rodar `pnpm dist` e anexar à mão, num Release com a tag `v<versão>`, os 3 arquivos de `dist\`.
3. Os totens instalados conferem ao abrir e a cada 4 horas, baixam em segundo plano e **instalam só na madrugada (3h às 5h do horário do computador) ou quando o app for fechado**, para nunca reiniciar no meio de um culto.

Para testar a atualização sem esperar a madrugada: abrir o app instalado com a variável `KALEO_UPDATE_NOW=1` (instala assim que baixa).

O token do GitHub é só de quem publica; nenhum segredo vai no aplicativo. O repositório é público de propósito: o app só abre o totem e não contém chave nem dado de igreja.

## Como funciona

1. Abre o totem do Kaleo **em tela cheia** e não deixa a janela sair do domínio dele.
2. Logo depois do pareamento, pergunta qual impressora do Windows este computador usa (fica salva só nesta máquina) e se o totem deve **abrir sozinho quando o Windows ligar** (ligado por padrão; só no app instalado).
3. Expõe ao totem a ponte `window.kaleoDesktop.print({ widthMm, heightMm })`. O totem a usa quando a impressora cadastrada no Kaleo (Check-in › Configurações › Impressoras) é do driver **"Aplicativo Kaleo Checkin Desktop"**. A ponte imprime em silêncio na impressora escolhida, no tamanho do papel, e devolve `{ ok: true, ms }` ou `{ ok: false, error }`; com erro, o totem avisa na tela.
4. **Fechar por engano não funciona:** Alt+F4 é ignorado. Para sair, `Ctrl+Shift+Q` e confirmar. Desligar o Windows continua funcionando.

Sem o aplicativo (navegador comum), a impressora desse driver cai na janela de impressão.

Atalhos: `F5` recarrega · `F11` alterna a tela cheia · `Ctrl+Shift+P` troca a impressora e o início automático · `Ctrl+Shift+Q` sai · `--windowed` abre em janela e libera o Alt+F4 (desenvolvimento).

O terminal (só em desenvolvimento) mostra o tempo de cada impressão (`impressão enviada em N ms`).

## Segurança

- Janela isolada (`contextIsolation`, sem Node na página, `sandbox`).
- A ponte só aceita chamadas da mesma origem do totem e papel entre 20 e 300 mm.
- Só o domínio do Kaleo recebe permissão de câmera; navegação para fora do domínio é bloqueada.
- A impressora escolhida e o início automático ficam só no computador (`settings.json` na pasta de dados do app).

## Testes

```powershell
pnpm test
```

Teste de fumaça do executável (abre o totem, confere a ponte e fecha; não registra início automático):

```powershell
$env:KALEO_SMOKE = "1"; $env:KALEO_SMOKE_OUT = "$env:TEMP\smoke.json"; & ".\dist\win-unpacked\Kaleo Checkin Desktop.exe"
```

## Limitações

- Windows primeiro; Mac e Linux usam o mesmo código, sem teste.
- Sem assinatura de código (o Windows mostra o aviso do SmartScreen). A atualização automática ainda não foi testada de ponta a ponta: depende do repositório e do primeiro Release no GitHub.

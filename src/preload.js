'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Ponte entre a página do totem e o aplicativo. Só expõe o necessário; o processo principal
// valida a origem da página e o tamanho do papel a cada chamada.
//
// O totem do Kaleo usa esta ponte quando a impressora cadastrada é do driver `desktop`:
//   window.kaleoDesktop.print({ widthMm, heightMm }) -> { ok: true, ms } | { ok: false, error }
// `error` é um código curto: 'sem_impressora', 'origem_invalida', 'tamanho_invalido' ou o
// motivo informado pelo Windows.
contextBridge.exposeInMainWorld('kaleoDesktop', {
  version: '0.4.3',
  print: (size) => ipcRenderer.invoke('print:silent', size),
})

'use strict'

// Inicia o Electron sem a variável ELECTRON_RUN_AS_NODE. Terminais de editores (VS Code, por
// exemplo) a definem, e com ela o Electron roda como Node puro e o app nem abre.

const { spawn } = require('node:child_process')
const electron = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))

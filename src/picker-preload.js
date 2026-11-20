'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pickerApi', {
  list: () => ipcRenderer.invoke('picker:list'),
  choose: (name) => ipcRenderer.invoke('picker:choose', name),
  getAutoStart: () => ipcRenderer.invoke('picker:get-autostart'),
  setAutoStart: (enabled) => ipcRenderer.invoke('picker:set-autostart', enabled),
})

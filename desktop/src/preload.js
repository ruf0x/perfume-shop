'use strict'

/**
 * The only thing the page can ask of the app (see frontend/src/desktop.d.ts). The page itself has no access to
 * Node or to the disk; every call is checked again in main.js.
 */

const { contextBridge, ipcRenderer } = require('electron')

const settings = ipcRenderer.sendSync('desktop:settings')

contextBridge.exposeInMainWorld('desktop', {
  apiUrl: settings.apiUrl,
  version: settings.version,
  getToken: () => ipcRenderer.invoke('desktop:get-token'),
  setToken: (token) => ipcRenderer.invoke('desktop:set-token', token),
  testServer: (url) => ipcRenderer.invoke('desktop:test-server', url),
  setServer: (url) => ipcRenderer.invoke('desktop:set-server', url),
  changeServer: () => ipcRenderer.invoke('desktop:change-server'),
})

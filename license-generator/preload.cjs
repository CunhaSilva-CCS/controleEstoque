const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('licenseGenerator', {
  selectKey: () => ipcRenderer.invoke('key:select'),
  generate: (input) => ipcRenderer.invoke('license:generate', input),
  save: (licenseKey, customer) => ipcRenderer.invoke('license:save', licenseKey, customer),
  copy: (value) => ipcRenderer.invoke('clipboard:copy', value),
})

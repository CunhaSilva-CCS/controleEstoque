const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenseGenerator", {
  selectKey: () => ipcRenderer.invoke("key:select"),
  generate: (input) => ipcRenderer.invoke("license:generate", input),
  save: (licenseKey, customer) =>
    ipcRenderer.invoke("license:save", licenseKey, customer),
  copy: (value) => ipcRenderer.invoke("clipboard:copy", value),
  registryStatus: () => ipcRenderer.invoke("registry:status"),
  registrySetToken: (token) => ipcRenderer.invoke("registry:setToken", token),
  registryClearToken: () => ipcRenderer.invoke("registry:clearToken"),
  registryRegister: (details) =>
    ipcRenderer.invoke("registry:register", details),
});

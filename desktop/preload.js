const { contextBridge, ipcRenderer } = require("electron");

// A5 çıktı ana süreçte basılır (bkz. a5Yazdir.js). Arayüz yazıcıyı kendi
// penceresinde seçtirir ve önizlemeyi kendisi gösterir.
contextBridge.exposeInMainWorld("vegaMasaustu", {
  yazicilar: () => ipcRenderer.invoke("a5:yazicilar"),
  a5Yazdir: (istek) => ipcRenderer.invoke("a5:yazdir", istek),
});

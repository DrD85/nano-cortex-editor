// Bridge between the editor page and the level meter helper (see meter.js and native/nano-meter.swift), and for the
// jam tracks (jam.js). The page gets these functions and nothing else of Electron.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nanoMeter', {
  list: () => ipcRenderer.invoke('meter:list'),                  // { devices: [{ uid, name, channels, rate, default }] } or { error }
  start: options => ipcRenderer.invoke('meter:start', options),  // { uid, first } -> { name, channels, rate, first, count } or { error }
  stop: () => ipcRenderer.invoke('meter:stop'),
  onData: handler => {                                           // { p: [left, right], e, n } every 25 ms, or { error }
    ipcRenderer.removeAllListeners('meter:data');
    ipcRenderer.on('meter:data', (event, data) => handler(data));
  }
});

contextBridge.exposeInMainWorld('nanoJam', {
  // A file from the page's folder chooser that the page cannot read (Apple Lossless, AIFF, CAF), as WAV:
  // { data: Uint8Array } or { error }. The path stays here - the page only gets the sound.
  convert: file => ipcRenderer.invoke('jam:convert', webUtils.getPathForFile(file))
});

// Bridge between the editor page and the level meter helper (see meter.js and native/nano-meter.swift).
// The page gets four functions and nothing else of Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nanoMeter', {
  list: () => ipcRenderer.invoke('meter:list'),                  // { devices: [{ uid, name, channels, rate, default }] } or { error }
  start: options => ipcRenderer.invoke('meter:start', options),  // { uid, first } -> { name, channels, rate, first, count } or { error }
  stop: () => ipcRenderer.invoke('meter:stop'),
  onData: handler => {                                           // { p: [left, right], e, n } every 25 ms, or { error }
    ipcRenderer.removeAllListeners('meter:data');
    ipcRenderer.on('meter:data', (event, data) => handler(data));
  }
});

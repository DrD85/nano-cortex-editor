// Bridge between the editor page and the app's helpers: the level meter (meter.js, native/nano-meter.swift), the
// monitor, the spectrum, and the jam tracks (jam.js). The page gets these functions and nothing else of Electron.
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

// The monitor plays the Nano's sound through another audio device (monitor.js, native/nano-monitor.swift).
contextBridge.exposeInMainWorld('nanoMonitor', {
  list: () => ipcRenderer.invoke('monitor:list'),                  // { devices: [{ uid, name, channels, rate, default }] } (outputs) or { error }
  start: options => ipcRenderer.invoke('monitor:start', options),  // { input, first, output, buffer, gain } -> { in, out, rate, outRate, ... } or { error }
  gain: value => ipcRenderer.invoke('monitor:gain', value),        // 0-4 while it plays
  stop: () => ipcRenderer.invoke('monitor:stop'),
  onData: handler => {                                             // { lat, under, skip, ppm, fill, p: [left, right] } four times a second, or { error }
    ipcRenderer.removeAllListeners('monitor:data');
    ipcRenderer.on('monitor:data', (event, data) => handler(data));
  }
});

// The spectrum behind the EQ view's curve (spectrum.js, native/nano-spectrum.swift).
contextBridge.exposeInMainWorld('nanoSpectrum', {
  start: options => ipcRenderer.invoke('spectrum:start', options),   // { uid, first } -> { name, rate, first, count, bands, from, perOctave } or { error }
  stop: () => ipcRenderer.invoke('spectrum:stop'),
  onData: handler => {                                               // { s: [dBFS of each band] } about twenty times a second, or { error }
    ipcRenderer.removeAllListeners('spectrum:data');
    ipcRenderer.on('spectrum:data', (event, data) => handler(data));
  }
});

contextBridge.exposeInMainWorld('nanoJam', {
  // A file from the page's folder chooser that the page cannot read (Apple Lossless, AIFF, CAF), as WAV:
  // { data: Uint8Array } or { error }. The path stays here - the page only gets the sound.
  convert: file => ipcRenderer.invoke('jam:convert', webUtils.getPathForFile(file))
});

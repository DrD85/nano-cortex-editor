// Jam tracks of the Mac app: audio files the editor's page cannot read - Apple Lossless in .m4a, AIFF, CAF - are
// turned into WAV by macOS itself (afconvert, part of the system) and handed to the page as bytes. Nothing is kept:
// the WAV lives in the temporary folder for the moment of the conversion.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONVERTIBLE = /\.(m4a|m4b|mp4|aif|aiff|aifc|caf)$/i;
let counter = 0;

function registerJam({ ipcMain }) {
  // file: path of a file the user chose in the page (the preload gets it from the File object).
  ipcMain.handle('jam:convert', (event, file) => new Promise(resolve => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !CONVERTIBLE.test(file)) { resolve({ error: 'This kind of file cannot be converted.' }); return; }
    const out = path.join(os.tmpdir(), 'nano-jam-' + process.pid + '-' + (++counter) + '.wav');
    execFile('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16', file, out], { timeout: 120000 }, err => {
      if (err) {
        fs.unlink(out, () => {});
        resolve({ error: 'macOS could not read the file (protected or damaged?).' });
        return;
      }
      fs.readFile(out, (readErr, data) => {
        fs.unlink(out, () => {});
        resolve(readErr ? { error: 'The converted file could not be read.' } : { data });
      });
    });
  }));
}

module.exports = { registerJam };

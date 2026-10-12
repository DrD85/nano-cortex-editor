// Spectrum of the EQ view: runs the nano-spectrum helper, which listens to a channel pair of an audio input (the
// Nano's sound on USB channels 3/4) and gives its level in narrow bands, and passes that on to the page.
const { spawn } = require('child_process');

// helperPath: the nano-spectrum binary; askAccess: async () => boolean (macOS asks for the "microphone" once).
// Returns a function that stops a running helper.
function registerSpectrum({ ipcMain, helperPath, askAccess }) {
  let child = null;

  const stop = () => {
    if (!child) return;
    const proc = child;
    child = null;
    proc.stdin.end();   // the helper ends when its stdin closes
    proc.kill();
  };

  ipcMain.handle('spectrum:start', async (event, options) => {
    stop();
    const uid = String((options && options.uid) || '');
    const first = Math.max(1, Math.min(64, Math.round(Number(options && options.first) || 3)));
    if (!uid) return { error: 'No audio input chosen.' };
    if (!(await askAccess())) return { error: 'denied' };
    const page = event.sender;
    const send = data => { if (!page.isDestroyed()) page.send('spectrum:data', data); };

    return new Promise(resolve => {
      const proc = spawn(helperPath, ['--device', uid, '--first', String(first)], { stdio: ['pipe', 'pipe', 'ignore'] });
      child = proc;
      let answered = false;
      let rest = '';
      const answer = value => { if (!answered) { answered = true; resolve(value); } };
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', chunk => {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop();
        for (const line of lines) {
          let data;
          try { data = JSON.parse(line); } catch (e) { continue; }
          if (data.start) answer(data.start);
          else if (data.error && !answered) answer({ error: data.error });
          else if (child === proc) send(data);
        }
      });
      proc.stdin.on('error', () => {});
      proc.on('error', err => answer({ error: 'The spectrum helper did not start: ' + err.message }));
      proc.on('exit', () => {
        answer({ error: 'The spectrum helper stopped.' });
        if (child === proc) { child = null; send({ error: 'The audio input stopped.' }); }
      });
      setTimeout(() => answer({ error: 'The audio input did not answer.' }), 5000);
    });
  });

  ipcMain.handle('spectrum:stop', () => { stop(); return true; });
  return stop;
}

module.exports = { registerSpectrum };

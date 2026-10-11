// Level meter of the Mac app: runs the nano-meter helper and passes its lines on to the editor page.
// The page itself only gets the first two channels of an audio input (Chromium opens inputs with more channels as
// stereo), but the Nano sends its processed sound on USB channels 3/4.
const { execFile, spawn } = require('child_process');

// helperPath: the nano-meter binary; askAccess: async () => boolean (macOS asks for the "microphone" once).
// Returns a function that stops a running helper.
function registerMeter({ ipcMain, helperPath, askAccess }) {
  let child = null;

  const stop = () => {
    if (!child) return;
    const proc = child;
    child = null;
    proc.stdin.end();   // the helper ends when its stdin closes
    proc.kill();
  };

  ipcMain.handle('meter:list', () => new Promise(resolve => {
    execFile(helperPath, ['--list'], { timeout: 5000 }, (err, stdout) => {
      if (err) { resolve({ error: 'The level meter helper did not start: ' + err.message }); return; }
      try { resolve({ devices: JSON.parse(stdout) }); } catch (e) { resolve({ error: 'The level meter helper gave no list.' }); }
    });
  }));

  ipcMain.handle('meter:start', async (event, options) => {
    stop();
    const uid = String((options && options.uid) || '');
    const first = Math.max(1, Math.min(64, Math.round(Number(options && options.first) || 1)));
    if (!uid) return { error: 'No audio input chosen.' };
    if (!(await askAccess())) return { error: 'denied' };
    const page = event.sender;
    const send = data => { if (!page.isDestroyed()) page.send('meter:data', data); };

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
      proc.on('error', err => answer({ error: 'The level meter helper did not start: ' + err.message }));
      proc.on('exit', () => {
        answer({ error: 'The level meter helper stopped.' });
        if (child === proc) { child = null; send({ error: 'The audio input stopped.' }); }
      });
      setTimeout(() => answer({ error: 'The audio input did not answer.' }), 5000);
    });
  });

  ipcMain.handle('meter:stop', () => { stop(); return true; });
  return stop;
}

module.exports = { registerMeter };

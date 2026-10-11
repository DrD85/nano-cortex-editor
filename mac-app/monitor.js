// Monitor of the beta app: runs the nano-monitor helper, which plays a channel pair of an audio input (the Nano's
// sound on USB channels 3/4) through another audio device, and passes its lines on to the editor page.
// Only a beta build has the helper and uses this (see main.js).
const { execFile, spawn } = require('child_process');

// helperPath: the nano-monitor binary; askAccess: async () => boolean (macOS asks for the "microphone" once).
// Returns a function that stops a running helper.
function registerMonitor({ ipcMain, helperPath, askAccess }) {
  let child = null;

  const stop = () => {
    if (!child) return;
    const proc = child;
    child = null;
    proc.stdin.end();   // the helper ends when its stdin closes
    proc.kill();
  };

  ipcMain.handle('monitor:list', () => new Promise(resolve => {
    execFile(helperPath, ['--list'], { timeout: 5000 }, (err, stdout) => {
      if (err) { resolve({ error: 'The monitor helper did not start: ' + err.message }); return; }
      try { resolve({ devices: JSON.parse(stdout) }); } catch (e) { resolve({ error: 'The monitor helper gave no list.' }); }
    });
  }));

  ipcMain.handle('monitor:start', async (event, options) => {
    stop();
    const input = String((options && options.input) || ''), output = String((options && options.output) || '');
    const first = Math.max(1, Math.min(64, Math.round(Number(options && options.first) || 3)));
    const buffer = [32, 64, 128, 256, 512].includes(Number(options && options.buffer)) ? Number(options.buffer) : 128;
    const gain = Math.max(0, Math.min(4, Number(options && options.gain)));
    if (!input || !output) return { error: 'Choose an input and an output.' };
    if (!(await askAccess())) return { error: 'denied' };
    const page = event.sender;
    const send = data => { if (!page.isDestroyed()) page.send('monitor:data', data); };

    return new Promise(resolve => {
      const proc = spawn(helperPath, ['--in', input, '--first', String(first), '--out', output, '--buffer', String(buffer),
        '--gain', String(Number.isFinite(gain) ? gain : 1)], { stdio: ['pipe', 'pipe', 'ignore'] });
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
      proc.stdin.on('error', () => {});   // the helper went away while a volume was written
      proc.on('error', err => answer({ error: 'The monitor helper did not start: ' + err.message }));
      proc.on('exit', () => {
        answer({ error: 'The monitor helper stopped.' });
        if (child === proc) { child = null; send({ error: 'The monitor stopped.' }); }
      });
      setTimeout(() => answer({ error: 'The audio devices did not answer.' }), 6000);
    });
  });

  // The volume while it plays (0-4, 1 = as it comes from the Nano).
  ipcMain.handle('monitor:gain', (event, gain) => {
    const value = Math.max(0, Math.min(4, Number(gain)));
    if (!child || !Number.isFinite(value)) return false;
    child.stdin.write('gain ' + value + '\n');
    return true;
  });

  ipcMain.handle('monitor:stop', () => { stop(); return true; });
  return stop;
}

module.exports = { registerMonitor };

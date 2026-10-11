// Beta part of the editor page: the Monitor. build.sh --beta puts this file at the end of the app's index.html;
// the normal app and the web editor do not have it. It plays the Nano's sound from USB (channels 3/4) through
// another audio device, like the audio settings of a standalone plugin, with the helper behind window.nanoMonitor
// (mac-app/monitor.js, native/nano-monitor.swift). It uses what the page defines: $, toast, clamp, dbText, toDb,
// meterPos, meterPair, pairText, levelStore, saveLevelStore, NANO_AUDIO, METER_DENIED, askConfirm, log.
(() => {
  if (!window.nanoMonitor || !window.nanoMeter) return;

  const STORE = 'nanoCortexMonitor';   // { input, output: names of the devices, buffer, gainDb }
  const BUFFERS = [64, 128, 256];
  const GAIN_MIN_DB = -40, GAIN_MAX_DB = 12;
  const store = { input: '', output: '', buffer: 128, gainDb: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (typeof saved.input === 'string') store.input = saved.input;
    if (typeof saved.output === 'string') store.output = saved.output;
    if (BUFFERS.includes(saved.buffer)) store.buffer = saved.buffer;
    if (Number.isFinite(saved.gainDb)) store.gainDb = clamp(Math.round(saved.gainDb), GAIN_MIN_DB, GAIN_MAX_DB);
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) { /* storage unavailable */ } };

  // inputs / outputs: { uid, name, channels, rate }; input / output: the chosen uid; first: first channel of the pair
  const monitor = { on: false, starting: false, inputs: [], outputs: [], input: '', output: '', first: 3, info: null, status: null, error: '',
    peakDb: [-Infinity, -Infinity] };
  const beta = (window.nanoBeta && window.nanoBeta.version) || 'beta';

  // ---- the page's own parts ----
  const style = document.createElement('style');
  style.textContent = `
    :root { --ico-monitor: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><g fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M4 9.5h3l4.5-4v13L7 14.5H4z'/><path d='M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'/></g></svg>"); }
    .beta-chip { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #ff7000; color: #0d0f11; font-size: 9.5px; font-weight: 700;
                 letter-spacing: .12em; text-transform: uppercase; line-height: 1.5; vertical-align: middle; }
    .brand-sub .beta-chip { margin-left: 3px; }
    #monitorBtn { position: relative; }
    #monitorBtn.playing::after { content: ""; position: absolute; right: 5px; top: 5px; width: 7px; height: 7px; border-radius: 50%; background: #45F862;
                                 box-shadow: 0 0 8px rgba(69, 248, 98, .7); }
    #monitorOverlay { z-index: 59; }   /* below the page's own question dialog */
    .monitor-panel { width: min(560px, calc(100vw - 32px)); gap: 14px; max-height: calc(100vh - 32px); overflow: auto; }
    .monitor-panel .block-title .beta-chip { margin-left: 2px; }
    .mon-rows { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 10px 12px; align-items: center; }
    .mon-label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #8e9297; }
    .mon-pick { display: flex; gap: 10px; min-width: 0; }
    .mon-pick select:first-child { flex: 1 1 auto; min-width: 0; }
    .mon-pick #monPair { flex: 0 0 auto; width: auto; }
    .mon-set { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .mon-set .seg-box .seg.text { width: auto; padding: 0 14px; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .mon-set .spacer { flex: 1 1 auto; }
    .mon-state { display: flex; align-items: baseline; gap: 10px; min-height: 22px; }
    .mon-state strong { font-size: 20px; font-weight: 650; color: #f2f2f2; font-variant-numeric: tabular-nums; }
    .mon-state strong:empty { display: none; }
    .mon-state span { color: #9aa0a6; font-size: 12.5px; line-height: 1.5; }
    .mon-state.error span { color: #ff8c8c; }
    .mon-state.warn span { color: #f2d14b; }
    .monitor-panel .ask-buttons { align-items: center; }
    .monitor-panel .ask-buttons .lv-hint { margin-right: auto; }
  `;
  document.head.appendChild(style);

  const sub = document.querySelector('.brand-sub');
  if (sub) {
    const chip = document.createElement('span');
    chip.className = 'beta-chip';
    chip.textContent = 'Beta';
    chip.title = 'Beta build ' + beta + ': it tries out the Monitor. The editor itself is the normal one.';
    const version = $('editorVersion');
    if (version) version.textContent = 'v' + beta;   // the build to name when you report something
    sub.appendChild(document.createTextNode(' '));
    sub.appendChild(chip);
  }

  const button = document.createElement('button');
  button.id = 'monitorBtn';
  button.className = 'icon-btn';
  button.title = 'Monitor (beta): hear the Nano from USB through another audio device';
  button.setAttribute('aria-label', 'Monitor');
  button.innerHTML = '<span class="ico" style="--icon: var(--ico-monitor)"></span>';
  const after = $('jamBtn');
  if (after && after.parentNode) after.parentNode.insertBefore(button, after.nextSibling);

  const overlay = document.createElement('div');
  overlay.id = 'monitorOverlay';
  overlay.className = 'ask-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="ask-panel monitor-panel" role="dialog" aria-label="Monitor">
      <div class="tuner-head">
        <div class="block-title" style="--block-color: #f2f2f2;"><span class="fx-icon" style="--icon: var(--ico-monitor)"></span><h2 class="dlg-title">Monitor</h2><span class="beta-chip">Beta</span></div>
        <button id="monClose" class="dlg-close" title="Close (Esc) – the monitor keeps playing" aria-label="Close"><span class="ico" style="--icon: var(--ico-close)"></span></button>
      </div>
      <div class="lv-hint">Plays the Nano's sound from USB through another audio device – an audio interface, speakers, headphones – like the
        audio settings of a standalone plugin. The sound passes through the Mac, so it arrives a few milliseconds late.</div>
      <div class="mon-rows">
        <span class="mon-label">Input</span>
        <div class="mon-pick"><select id="monInput" aria-label="Audio input"></select>
          <select id="monPair" aria-label="Channels" title="The channels to play – on the Nano 1/2 are the dry guitar signal, 3/4 its sound"></select></div>
        <span class="mon-label">Output</span>
        <div class="mon-pick"><select id="monOutput" aria-label="Audio output"></select></div>
        <span class="mon-label">Buffer</span>
        <div class="mon-set">
          <div id="monBuffers" class="seg-box" role="group" aria-label="Buffer size" title="Frames per round on both devices: smaller is a shorter delay, larger is safer against dropouts"></div>
          <span class="spacer"></span>
          <span class="mon-label">Volume</span>
          <div id="monGainBox" class="seg-box" role="group" aria-label="Volume of the monitor">
            <button id="monDown" class="seg sign" aria-label="Quieter">−</button>
            <span class="seg-value"><strong id="monGain"></strong><em>dB</em></span>
            <button id="monUp" class="seg sign" aria-label="Louder">+</button>
          </div>
        </div>
      </div>
      <div class="lv-meter">
        <div class="lv-row"><span class="lv-ch">L</span><div class="lv-bar"><i id="monBarL"></i></div><span class="lv-num"><strong id="monNumL">–</strong> dB</span></div>
        <div class="lv-row"><span class="lv-ch">R</span><div class="lv-bar"><i id="monBarR"></i></div><span class="lv-num"><strong id="monNumR">–</strong> dB</span></div>
      </div>
      <div id="monState" class="mon-state"><strong id="monDelay"></strong><span id="monText"></span></div>
      <div class="ask-buttons">
        <span class="lv-hint">Start with a low volume on speakers.</span>
        <button type="button" id="monStart" class="primary">Start</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  BUFFERS.forEach(size => {
    const seg = document.createElement('button');
    seg.className = 'seg text';
    seg.dataset.buffer = size;
    seg.textContent = size;
    seg.addEventListener('click', () => { if (store.buffer !== size) { store.buffer = size; save(); render(); restart(); } });
    $('monBuffers').appendChild(seg);
  });

  // ---- state ----
  const inputNow = () => monitor.inputs.find(d => d.uid === monitor.input) || null;
  const outputNow = () => monitor.outputs.find(d => d.uid === monitor.output) || null;
  // (the device that is the input is no output here: the Nano would get its own sound back)
  const outputsShown = () => monitor.outputs.filter(d => d.uid !== monitor.input);

  async function refresh() {
    const [inputs, outputs] = await Promise.all([window.nanoMeter.list(), window.nanoMonitor.list()]);
    monitor.inputs = (inputs && inputs.devices) || [];
    monitor.outputs = (outputs && outputs.devices) || [];
    const failed = (inputs && inputs.error) || (outputs && outputs.error) || '';
    if (failed) monitor.error = failed;   // (what stopped the monitor stays to be read until it is opened or started again)
    if (!monitor.on) {   // while it plays the choice stays as it is
      // The Nano, or the input used last time. Never a microphone by itself: played through speakers it would howl.
      const input = monitor.inputs.find(d => d.name === store.input) || monitor.inputs.find(d => NANO_AUDIO.test(d.name));
      monitor.input = input ? input.uid : '';
      monitor.first = input ? meterPair(input.name, input.channels) : 3;
      const shown = outputsShown();
      const output = shown.find(d => d.name === store.output) || shown.find(d => d.default) || shown[0];
      monitor.output = output ? output.uid : '';
    }
    render();
  }

  function render() {
    button.classList.toggle('on', !overlay.hidden);
    button.classList.toggle('playing', monitor.on && overlay.hidden);
    if (overlay.hidden) return;
    const input = inputNow(), busy = monitor.starting;
    const fill = (select, list, chosen, none) => {
      select.innerHTML = '';
      if (!list.length) select.appendChild(new Option(none, ''));
      list.forEach(d => select.appendChild(new Option(d.name, d.uid, false, d.uid === chosen)));
      select.disabled = busy || !list.length;
    };
    fill($('monInput'), monitor.inputs, monitor.input, 'No audio input');
    if (monitor.inputs.length && !input) $('monInput').insertBefore(new Option('Choose an input …', '', true, true), $('monInput').firstChild);
    fill($('monOutput'), outputsShown(), monitor.output, 'No other audio output');
    const pair = $('monPair');
    pair.innerHTML = '';
    const total = input ? input.channels : 0;
    for (let first = 1; first <= total; first += 2) pair.appendChild(new Option('Ch ' + pairText(first, total), first, false, first === monitor.first));
    pair.hidden = total <= 2;
    pair.disabled = busy;
    $('monBuffers').querySelectorAll('.seg').forEach(seg => {
      seg.classList.toggle('on', Number(seg.dataset.buffer) === store.buffer);
      seg.disabled = busy;
    });
    $('monGain').textContent = dbText(store.gainDb, true);
    $('monGainBox').title = 'Volume of the monitor: ' + (store.gainDb ? dbText(Math.abs(store.gainDb)) + ' dB ' + (store.gainDb < 0 ? 'quieter' : 'louder') + ' than' : 'as') +
      ' the sound comes from the Nano. The Mac\'s own volume for the output comes on top';
    const start = $('monStart');
    start.textContent = busy ? 'Starting …' : monitor.on ? 'Stop' : 'Start';
    start.classList.toggle('primary', !monitor.on);
    start.disabled = busy || (!monitor.on && (!monitor.input || !monitor.output));

    const state = $('monState'), status = monitor.status;
    let text = '', delay = '', kind = '';
    if (monitor.error) { text = monitor.error; kind = 'error'; }
    else if (busy) text = 'Opening the two audio devices …';
    else if (monitor.on && status) {
      delay = status.lat.toFixed(1) + ' ms';
      const lost = status.under + status.skip;
      text = 'delay through the Mac · ' + (lost ? lost + ' dropout' + (lost === 1 ? '' : 's') + (store.buffer < 256 ? ' – try a larger buffer' : '') : 'no dropouts') +
        (monitor.info && monitor.info.outRate !== monitor.info.rate ? ' · ' + (monitor.info.rate / 1000) + ' → ' + (monitor.info.outRate / 1000) + ' kHz' : '');
      if (lost) kind = 'warn';
    } else if (monitor.on) text = 'Running …';
    else if (!input && !monitor.inputs.some(d => NANO_AUDIO.test(d.name))) text = 'No Nano Cortex on USB – connect it to the Mac with a USB-C cable.';
    else if (input && NANO_AUDIO.test(input.name) && monitor.first < 3) text = 'Channels 1/2 are the dry guitar signal – the Nano\'s sound is on 3/4.';
    else if (!outputsShown().length) text = 'No other audio output found.';
    else text = 'Off.';
    state.className = 'mon-state' + (kind ? ' ' + kind : '');
    $('monDelay').textContent = delay;
    $('monText').textContent = text;
    drawPeaks();
  }

  function drawPeaks() {
    [['monBarL', 'monNumL'], ['monBarR', 'monNumR']].forEach(([bar, num], i) => {
      const db = monitor.on ? monitor.peakDb[i] : -Infinity;
      $(bar).style.setProperty('--v', meterPos(db));
      $(num).textContent = db > -100 ? dbText(db) : '–';
    });
  }

  const gainNow = () => Math.pow(10, store.gainDb / 20);

  async function start() {
    const input = inputNow(), output = outputNow();
    if (monitor.starting || !input || !output) return;
    if (!NANO_AUDIO.test(input.name) && !(await askConfirm('Play "' + input.name + '" through "' + output.name + '"?',
      'This input is not a Nano Cortex. If it is a microphone that hears the output, the sound feeds back and howls – use headphones, or start with the volume low.',
      { ok: 'Play' }))) return;
    monitor.starting = true;
    monitor.error = '';
    monitor.status = null;
    render();
    const info = await window.nanoMonitor.start({ input: input.uid, first: monitor.first, output: output.uid, buffer: store.buffer, gain: gainNow() });
    monitor.starting = false;
    if (!info || info.error) {
      monitor.on = false;
      monitor.error = info && info.error === 'denied' ? METER_DENIED : (info && info.error) || 'The monitor did not start.';
      log('Monitor: ' + monitor.error);
    } else {
      monitor.on = true;
      monitor.info = info;
      store.input = input.name;
      store.output = output.name;
      save();
      if (levelStore.pairs[input.name] !== monitor.first) { levelStore.pairs[input.name] = monitor.first; saveLevelStore(); }
      log('Monitor: ' + info.in + ' ' + pairText(info.first, info.first + info.count - 1) + ' → ' + info.out + ', buffer ' + info.buffer + ' / ' + info.outBuffer);
    }
    render();
  }

  async function stop() {
    monitor.on = false;
    monitor.status = null;
    monitor.peakDb = [-Infinity, -Infinity];
    await window.nanoMonitor.stop();
    render();
  }

  // A setting that the running monitor cannot take over: once more with it.
  async function restart() {
    if (!monitor.on) return;
    await stop();
    await start();
  }

  window.nanoMonitor.onData(data => {
    if (data.error) {
      if (!monitor.on) return;
      monitor.on = false;
      monitor.status = null;
      monitor.error = data.error;
      toast('Monitor: ' + data.error, 'error');
      render();
      refresh();
      return;
    }
    if (!monitor.on || !Number.isFinite(data.lat)) return;
    monitor.status = data;
    monitor.peakDb = [toDb(data.p[0]), toDb(data.p[1])];
    render();
  });

  function open() {
    overlay.hidden = false;
    monitor.error = '';
    render();
    $('monClose').focus();
    refresh();
  }
  function close() {
    overlay.hidden = true;
    render();
  }

  button.addEventListener('click', () => (overlay.hidden ? open() : close()));
  $('monClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) close(); });
  $('monStart').addEventListener('click', () => (monitor.on ? stop() : start()));
  $('monInput').addEventListener('change', e => {
    monitor.input = e.target.value;
    const input = inputNow();
    monitor.first = input ? meterPair(input.name, input.channels) : 3;
    if (monitor.output === monitor.input) { const other = outputsShown()[0]; monitor.output = other ? other.uid : ''; }
    render();
    restart();
  });
  $('monPair').addEventListener('change', e => { monitor.first = Number(e.target.value) || 1; render(); restart(); });
  $('monOutput').addEventListener('change', e => { monitor.output = e.target.value; render(); restart(); });
  const nudge = step => {
    store.gainDb = clamp(store.gainDb + step, GAIN_MIN_DB, GAIN_MAX_DB);
    save();
    if (monitor.on) window.nanoMonitor.gain(gainNow());
    render();
  };
  $('monDown').addEventListener('click', () => nudge(-1));
  $('monUp').addEventListener('click', () => nudge(1));
  // the audio devices change (a cable): the lists follow while the dialog is open
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { if (!overlay.hidden) refresh(); });
  }

  window.nanoMonitor.stop();   // (a reloaded page: nothing plays that the page does not know of)
  render();
  window.nanoMonitorPage = { monitor, store, open, close, start, stop, refresh, render };   // for tests
})();

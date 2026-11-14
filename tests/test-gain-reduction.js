<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    state.blocks.pre2.on = true; render();
    let el = document.querySelector('#block-pre2 .gr-meter');
    ok('off state with Measure button', el && el.classList.contains('off') && getComputedStyle(el.querySelector('.gr-start')).display !== 'none');
    ok('no meter on a non-compressor', !document.querySelector('#block-pre1 .gr-meter'));
    // the meter on, as the Mac app's helper on 3/4 with the dry signal on 1/2
    Object.assign(meter, { on: true, native: true, label: 'Nano Cortex', first: 3, total: 8, channels: 2, rate: 48000 });
    const c = duoCompModel(state.blocks.pre2);
    const amp = 0.5;   // sine peak 0.5 -> RMS -9 dBFS
    const ms = amp * amp / 2;
    const feed = () => { meter.di = { p: [amp, amp], e: ms * 2 * 1200, n: 1200, s: [ms * 1200, ms * 1200] }; meter.plainMs = 0.01; meterFeed([0.3, 0.3], 0.02 * 1200, 1200, 48000); };
    for (let i = 0; i < 160; i++) { feed(); await wait(25); }
    el = document.querySelector('#block-pre2 .gr-meter');
    const inDb = 10 * Math.log10(ms);
    const expect = Math.max(0, inDb - duoCompOut(c, inDb));
    const shown = parseFloat(el.querySelector('.val').textContent.replace('−', '-'));
    ok('on state', !el.classList.contains('off'));
    ok('GR ' + shown + ' ~ ' + expect.toFixed(2) + ' (thr ' + c.thr + ', ratio ' + c.ratio + ', att ' + c.attack + ', rel ' + c.release + ')', Math.abs(Math.abs(shown) - expect) < 0.3);
    ok('source text: ' + el.querySelector('.src').textContent, /DI 1\/2/.test(el.querySelector('.src').textContent));
    ok('bar width ' + el.querySelector('.bar').style.getPropertyValue('--gr'), parseFloat(el.querySelector('.bar').style.getPropertyValue('--gr')) > 0);
    // silence: falls with the release, the peak mark stays 1.5 s
    const silent = () => { meter.di = { p: [0, 0], e: 0, n: 1200, s: [0, 0] }; meterFeed([0, 0], 0, 1200, 48000); };
    for (let i = 0; i < 20; i++) { silent(); await wait(25); }
    const bar = el.querySelector('.bar');
    ok('peak held (' + bar.style.getPropertyValue('--grp') + ' > ' + bar.style.getPropertyValue('--gr') + ')', parseFloat(bar.style.getPropertyValue('--grp')) > parseFloat(bar.style.getPropertyValue('--gr')) && bar.querySelector('b.show'));
    // a post compressor: from the output, rough
    const pk = ['post1', 'post2', 'post3'].find(k => state.blocks[k].models.some(m => /comp/i.test(m.name)));
    if (!pk) { ok('no post block takes a compressor', true); throw new Error('skip post'); }
    const pm = state.blocks[pk].models.find(m => /comp/i.test(m.name));
    state.blocks[pk].model = pm.name; state.blocks[pk].params = structuredClone(pm.params); state.blocks[pk].on = true; render();
    for (let i = 0; i < 10; i++) { meter.di = null; meter.plainMs = 0.05; meterFeed([0.3, 0.3], 0.05 * 2400, 1200, 48000); await wait(25); }
    const p1 = document.querySelector('#block-' + pk + ' .gr-meter');
    ok('post ' + pm.name + ' ' + JSON.stringify(duoCompModel(state.blocks[pk])) + ': ' + p1.querySelector('.src').textContent + ' ' + p1.querySelector('.val').textContent, /≈out 3\/4/.test(p1.querySelector('.src').textContent));
    // the browser: only 1/2 = DI
    Object.assign(meter, { native: false, first: 1, di: null, plainMs: ms });
    for (let i = 0; i < 5; i++) { meter.plainMs = ms; meterFeed([amp, amp], 0.02 * 1200, 1200, 48000); await wait(25); }
    ok('browser DI: ' + document.querySelector('#block-pre2 .gr-meter .src').textContent, /DI 1\/2 · in/.test(document.querySelector('#block-pre2 .gr-meter .src').textContent));
    // another interface: says so
    Object.assign(meter, { label: 'Quad Cortex' });
    meterFeed([0.3, 0.3], 0.02 * 1200, 1200, 48000);
    ok('other interface: ' + document.querySelector('#block-pre2 .gr-meter .src').textContent, /Quad Cortex, not the Nano/.test(document.querySelector('#block-pre2 .gr-meter .src').textContent));
    // Legendary 87 (fast): the peak counts
    Object.assign(meter, { label: 'Nano Cortex', native: true, first: 3 });
    const b = state.blocks.pre1, lm = b.models.find(x => x.name === 'Legendary 87 (M)');
    b.model = lm.name; b.params = structuredClone(lm.params); b.on = true; render();
    for (let i = 0; i < 40; i++) { meter.di = { p: [0.5, 0.5], e: 0, n: 1200, s: [0.01 * 1200, 0.01 * 1200] }; meterFeed([0.3, 0.3], 0.02 * 1200, 1200, 48000); await wait(25); }
    const l = document.querySelector('#block-pre1 .gr-meter');
    ok('Legendary 87 on the peak: ' + l.querySelector('.src').textContent + ' ' + l.querySelector('.val').textContent, /in −6 \/ thr −10/.test(l.querySelector('.src').textContent) && parseFloat(l.querySelector('.val').textContent.replace('−', '-')) < -1);
    meterStop(); renderLevel();
    ok('off again', document.querySelector('#block-pre2 .gr-meter').classList.contains('off'));
  } catch (e) { out.push((e.message === 'skip post' ? 'NOTE ' : 'ERROR ') + e.stack.split('\n')[0]); }
  document.title = out.join(' | ');
  document.body.dataset.done = '1';
}, 1500);
</script>

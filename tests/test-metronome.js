<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sent = [];
  writeC304 = async (label, frame) => { sent.push({ label, bytes: Array.from(frame) }); return true; };
  const hx = a => a.map(b => b.toString(16).padStart(2, '0')).join(' ');
  try {
    ok('no tile without firmware', !document.getElementById('tempoNode'));
    metro.firmware = '2.2.1'; metroRefresh();
    ok('no tile on 2.2.1', !document.getElementById('tempoNode'));
    metro.firmware = '2.3.0+05c36621'; metro.tempo = 120; metro.global = true; metroRefresh();
    const node = document.getElementById('tempoNode');
    ok('tile on 2.3.0: ' + (node && node.textContent), node && /120/.test(node.textContent) && /Tempo4\/4$/.test(node.textContent));
    node.click(); await wait(50);
    ok('dialog open', !$('metroOverlay').hidden);
    const f = sent.pop();
    ok('open frame: ' + hx(f.bytes) + ' (' + f.label + ')', hx(f.bytes) === '1c c0 18 01 20 01 2d 00 00 f0 42 30 00 3d 00 00 00 00 40 01 48 02 50 00 58 00 91 00 00 00');
    $('mtOn').click(); await wait(20);
    const g = sent.pop();
    ok('metronome on frame has 40 00', g && hx(g.bytes).includes('40 00 48 02'));
    // tempo by wheel (debounced)
    $('mtDial').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    await wait(200);
    const h = sent.pop();
    ok('wheel -> 121: ' + (h && h.label), h && /Tempo 121.0 BPM/.test(h.label));
    // tap: 500 ms apart -> 120
    const tapBtn = $('mtTap');
    for (let i = 0; i < 4; i++) { tapBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await wait(500); }
    await wait(200);
    ok('tap -> ~120: ' + metro.tempo, Math.abs(metro.tempo - 120) < 1.5);
    // preset scope
    $('mtScope').querySelector('[data-v="0"]').click(); await wait(20);
    ok('preset scope frame has 20 00', hx(sent[sent.length - 1].bytes).startsWith('1c c0 18 01 20 00'));
    // the Nano closes its tempo screen
    const n0 = sent.length;
    handleTypedMessage(buildFrame([0x18, 0x00], 145)); await wait(20);
    ok('closed by the Nano, nothing sent', $('metroOverlay').hidden && sent.length === n0);
    // the Nano opens its tempo screen with its settings
    const v = float32LE(-12), t = float32LE(95);
    handleTypedMessage(buildFrame([0x18, 0x01, 0x20, 0x01, 0x2D, ...t, 0x3D, ...v, 0x40, 0x00, 0x48, 0x0D, 0x50, 0x01, 0x58, 0x01], 145)); await wait(20);
    ok('opened by the Nano, nothing sent, settings taken: ' + JSON.stringify(metro.settings) + ' ' + metro.tempo,
      !$('metroOverlay').hidden && sent.length === n0 && metro.settings.volume === -12 && metro.settings.timeSig === 13 && metro.settings.note === 1 && metro.settings.sound === 1 && metro.tempo === 95);
    ok('tile shows 6/8: ' + document.getElementById('tempoNode').textContent, /Tempo6\/8$/.test(document.getElementById('tempoNode').textContent));
    ok('volume text ' + $('mtVol').textContent, /−12\.0/.test($('mtVol').textContent));
    // closing from the editor
    $('mtClose').click(); await wait(120);
    const c = sent.pop();
    ok('close frame: ' + hx(c.bytes), hx(c.bytes) === '06 c0 18 00 91 00 00 00');
    ok('stored', JSON.parse(localStorage.getItem('nanoMetronome')).timeSig === 13);
    const beatsOn = document.querySelectorAll('#tempoNode .mt-beats i.now').length;
    ok('beat dot moving on the tile', beatsOn === 1);
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 2).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

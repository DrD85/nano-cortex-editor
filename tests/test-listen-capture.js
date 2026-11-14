<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sent = [];
  writeC304 = async (label, frame) => { sent.push({ label, bytes: Array.from(frame) }); return true; };
  const hx = a => a.map(b => b.toString(16).padStart(2, '0')).join(' ');
  try {
    audSetup(); await wait(50);
    const rows = [...document.querySelectorAll('#libList .lib-item')];
    ok('play buttons: ' + rows.filter(r => r.querySelector('.aud-play')).length + '/' + rows.length, rows.length > 0 && rows.every(r => r.querySelector('.aud-play')));
    ok('bar hidden', $('audBar').hidden);
    const bass = rows.find(r => r.textContent.includes('Bassman 59 Edge'));
    bass.querySelector('.aud-play').click(); await wait(30);
    const f = sent.pop();
    // factory index 2, name "Bassman 59 Edge" (15 bytes): 1a 13 08 02 12 0f ...
    const name = Array.from(new TextEncoder().encode('Bassman 59 Edge'));
    const want = [0, 0xc0, 0x1a, 2 + 2 + name.length, 0x08, 0x02, 0x12, name.length, ...name, 150, 0, 0, 0]; want[0] = want.length - 2;
    ok('listen frame ' + hx(f.bytes), hx(f.bytes) === hx(want));
    ok('library stayed open, no slot load', !$('libraryOverlay').hidden && !sent.some(s => /slot/i.test(s.label)));
    ok('bar shows: ' + $('audBar').textContent.replace(/\s+/g, ' ').trim(), !$('audBar').hidden && /Bassman 59 Edge/.test($('audBarName').textContent) && /Starting/.test($('audBarNote').textContent));
    // reply 151 status 1
    handleTypedMessage(buildFrame([0x08, 0x02, 0x18, 0x01], 151)); await wait(20);
    ok('after reply: ' + $('audBarNote').textContent, /Listening/.test($('audBarNote').textContent));
    let row = [...document.querySelectorAll('#libList .lib-item')].find(r => r.textContent.includes('Bassman 59 Edge'));
    ok('row marked listening', row.classList.contains('aud') && row.querySelector('.aud-play.on') && /Listening/i.test(row.textContent));
    // switch to another: a second 150, no stop in between
    [...document.querySelectorAll('#libList .lib-item')].find(r => r.textContent.includes('TwoRock Clean')).querySelector('.aud-play').click(); await wait(20);
    const g = sent.pop();
    ok('user capture uses field 4: ' + hx(g.bytes).slice(0, 14), g.bytes[2] === 0x22 && g.bytes[g.bytes.length - 4] === 150 && !sent.some(s => s.bytes[s.bytes.length - 4] === 148));
    handleTypedMessage(buildFrame([0x08, 0x02, 0x18, 0x01], 151));
    // stop via the row button
    [...document.querySelectorAll('#libList .lib-item')].find(r => r.textContent.includes('TwoRock Clean')).querySelector('.aud-play').click(); await wait(20);
    const h = sent.pop();
    ok('stop frame ' + hx(h.bytes), h.bytes[2] === 0x10 && h.bytes[h.bytes.length - 4] === 148 && hx(h.bytes).includes('18 00 94 00 00 00') && $('audBar').hidden);
    // requestId decodes to now
    let v = 0, mul = 1, i = 3; while (true) { const b = h.bytes[i++]; v += (b & 0x7f) * mul; mul *= 128; if (!(b & 0x80)) break; }
    ok('request id is the time ' + v, Math.abs(v - Date.now()) < 5000);
    // refused
    [...document.querySelectorAll('#libList .lib-item')][0].querySelector('.aud-play').click(); await wait(20);
    handleTypedMessage(buildFrame([0x08, 0x02, 0x18, 0x02], 151)); await wait(20);
    ok('refused -> cleared', !audition.current && $('audBar').hidden);
    // close the library while listening -> stop
    [...document.querySelectorAll('#libList .lib-item')][0].querySelector('.aud-play').click(); await wait(20);
    const n = sent.length;
    closeLibraryBrowser(); await wait(20);
    ok('closing stops', sent.length === n + 1 && sent[n].bytes[sent[n].bytes.length - 4] === 148);
    // load from the bar: stop then slot chooser
    openLibraryBrowser(); await wait(20);
    [...document.querySelectorAll('#libList .lib-item')][1].querySelector('.aud-play').click(); await wait(20);
    let chosen = null; chooseSlot = async (k, nm) => { chosen = nm; return null; };
    $('audLoad').click(); await wait(50);
    ok('load: stopped and asked for a slot for ' + chosen, chosen && sent[sent.length - 1].bytes[sent[sent.length - 1].bytes.length - 4] === 148 && $('libraryOverlay').hidden);
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 2).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

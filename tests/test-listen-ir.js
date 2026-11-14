<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sent = [];
  writeC304 = async (label, frame) => { sent.push({ label, bytes: Array.from(frame) }); return true; };
  const hx = a => a.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const last = () => sent[sent.length - 1];
  const typ = f => f.bytes[f.bytes.length - 4];
  try {
    audSetup(); await wait(30);
    state.library.irFactory = [{ index: 0, name: '212 US TWN C12Q 00s' }, { index: 1, name: '412 UK GB 25' }];
    state.library.irUser = [{ index: 0, name: 'AATR 2X12 TR12 6K' }];
    // capture playing, then open the IR library -> capture stops
    auditionStart(state.library.factory[1]); await wait(20);
    openLibraryBrowser('ir'); await wait(30);
    ok('switching library stops the capture', typ(last()) === 148 && hx(last().bytes).includes('18 00 94'));
    ok('title ' + document.querySelector('#libraryOverlay .dlg-title').textContent, /Cab \/ IR Library/.test(document.querySelector('#libraryOverlay .dlg-title').textContent));
    ok('capture filters hidden', getComputedStyle($('libTags')).display === 'none' && getComputedStyle($('libSource')).display !== 'none');
    const rows = [...document.querySelectorAll('#libList .lib-item')];
    ok('3 IR rows with play: ' + rows.map(r => r.querySelector('.lib-name').textContent).join(', '), rows.length === 3 && rows.every(r => r.querySelector('.aud-play')));
    rows.find(r => r.textContent.includes('412 UK')).querySelector('.aud-play').click(); await wait(20);
    const name = Array.from(new TextEncoder().encode('412 UK GB 25'));
    const want = [0, 0xc0, 0x1a, 4 + name.length, 0x08, 0x01, 0x12, name.length, ...name, 158, 0, 0, 0]; want[0] = want.length - 2;
    ok('IR listen frame ' + hx(last().bytes), hx(last().bytes) === hx(want));
    handleTypedMessage(buildFrame([0x08, 0x02, 0x18, 0x01], 159)); await wait(20);
    ok('IR listening shown', /Listening/.test($('audBarNote').textContent) && /412 UK/.test($('audBarName').textContent));
    // user IR uses field 4
    [...document.querySelectorAll('#libList .lib-item')].find(r => r.textContent.includes('AATR 2X12')).querySelector('.aud-play').click(); await wait(20);
    ok('user IR field 4', last().bytes[2] === 0x22 && typ(last()) === 158);
    $('audStop').click(); await wait(20);
    ok('IR stop uses field 4: ' + hx(last().bytes), typ(last()) === 148 && hx(last().bytes).includes(' 20 00 94'));
    // search
    $('librarySearch').value = 'twn'; $('librarySearch').dispatchEvent(new Event('input')); await wait(20);
    ok('search', document.querySelectorAll('#libList .lib-item').length === 1);
    // load from the bar goes to the cab loader
    $('librarySearch').value = ''; $('librarySearch').dispatchEvent(new Event('input'));
    [...document.querySelectorAll('#libList .lib-item')][0].querySelector('.aud-play').click(); await wait(20);
    let cab = null; loadLibraryCab = async (k, i) => { cab = k + ':' + i; return null; };
    $('audLoad').click(); await wait(20);
    ok('load from bar -> ' + cab, cab === 'irFactory:0');
    // back to captures: filters come back
    openLibraryBrowser('capture'); await wait(20);
    ok('capture library again', /Capture Library/.test(document.querySelector('#libraryOverlay .dlg-title').textContent) && getComputedStyle($('libTags')).display !== 'none');
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 2).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

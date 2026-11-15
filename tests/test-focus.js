<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sent = [];
  writeC304 = async (label, frame, key) => { sent.push({ label, key }); return true; };
  try { localStorage.removeItem('nanoFocusCorners'); } catch (e) {}
  try {
    // ---- the corner sounds: every model exists, every control and value is one the model has, four different sounds
    const all = {};
    for (const key of FX_SLOT_KEYS) for (const m of state.blocks[key].models) all[focusModelKey(m.name)] = m;
    const bad = []; let least = [9, ''], count = 0;
    for (const [name, corners] of Object.entries(FOCUS_CORNERS)) {
      const model = all[name];
      if (!model) { bad.push(name + ': no such model'); continue; }
      if (corners.length !== 4) bad.push(name + ': ' + corners.length + ' corners');
      if (new Set(corners.map(c => c.name)).size !== corners.length) bad.push(name + ': a name twice');
      const block = { params: structuredClone(model.params) };
      const travels = corners.map(corner => {
        count++;
        if (corner.name.length > 24) bad.push(name + ' / ' + corner.name + ': name too long');
        const list = fxStartParams(block, corner), t = {};
        for (const [control, value] of Object.entries(corner.values)) {
          const hit = list.find(x => x.param.name.toLowerCase() === control.toLowerCase());
          if (!hit) { bad.push(name + ' / ' + corner.name + ': ' + control + ' = ' + value + ' not on the model'); continue; }
          const meta = hit.param.meta;
          if (meta.kind === 'range' && Math.abs(hit.value - value) > 1e-6) bad.push(name + ' / ' + corner.name + ': ' + control + ' ' + value + ' becomes ' + hit.value);
          const ratio = meta.kind === 'range' && /^(Hz|ms|s)$/.test(meta.unit || '') && meta.min > 0;   // times and frequencies: by their ratio
          t[hit.param.index] = meta.kind === 'enum' ? 1000 + hit.value   // a switch: another position is another sound
            : ratio ? Math.log(hit.value / meta.min) / Math.log(meta.max / meta.min) : paramValueToNormalized(Object.assign({}, hit.param, { value: hit.value }));
        }
        return t;
      });
      // how far apart two corners are, along the controls the corners set (0-1 each): one control by 0.3 at least,
      // and the two that differ most by 0.2 on average
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const keys = [...new Set(Object.keys(travels[a]).concat(Object.keys(travels[b])))];
        const gap = (p, q) => (p >= 1000 || q >= 1000 ? (p === q ? 0 : p === undefined || q === undefined ? 0.5 : 1) : Math.abs((p ?? 0.5) - (q ?? 0.5)));
        const gaps = keys.map(k => gap(travels[a][k], travels[b][k])).sort((p, q) => q - p);
        const most = gaps[0], far = (gaps[0] + (gaps[1] || 0)) / 2;   // the two controls that differ most
        if (most < 0.3) bad.push(name + ': ' + corners[a].name + ' and ' + corners[b].name + ' differ by at most ' + most.toFixed(2) + ' on any control');
        if (far < least[0]) least = [far, name + ': ' + corners[a].name + ' / ' + corners[b].name];
      }
    }
    ok(Object.keys(FOCUS_CORNERS).length + ' models, ' + count + ' corner sounds fit their models' + (bad.length ? ': ' + bad.slice(0, 12).join('; ') : ''), bad.length === 0);
    ok('closest pair ' + least[1] + ' (' + least[0].toFixed(2) + ')', least[0] >= 0.2);
    const single = Object.values(all).filter(m => m.name !== 'None' && !focusHas(m.name)).map(m => m.name);
    ok('without a focus view: ' + single.join(', '), single.every(n => /Wah|Adaptive Gate|Volume/.test(n)));

    // ---- players' sounds: every one fits its model and says where it comes from
    const wrong = []; let sounds = 0;
    for (const [name, list] of Object.entries(FX_ARTIST_SOUNDS)) {
      const model = all[name];
      if (!model) { wrong.push(name + ': no such model'); continue; }
      if (!fxInfoOf(model.name) || !fxInfoOf(model.name).rich) wrong.push(name + ': no large info dialog to show them in');
      if (new Set(list.map(c => c.name)).size !== list.length) wrong.push(name + ': a name twice');
      const blk = { params: structuredClone(model.params) };
      for (const sound of list) {
        sounds++;
        if (sound.name.length > 24 || !/^[^:]+: \S/.test(sound.name)) wrong.push(name + ' / ' + sound.name + ': name');
        if (!sound.why || sound.why.length < 30) wrong.push(name + ' / ' + sound.name + ': no note');
        const fit = fxStartParams(blk, sound);
        for (const [control, value] of Object.entries(sound.values)) {
          const hit = fit.find(x => x.param.name.toLowerCase() === control.toLowerCase());
          if (!hit) wrong.push(name + ' / ' + sound.name + ': ' + control + ' = ' + value + ' not on the model');
          else if (hit.param.meta.kind === 'range' && Math.abs(hit.value - value) > 1e-6) wrong.push(name + ' / ' + sound.name + ': ' + control + ' ' + value + ' becomes ' + hit.value);
        }
      }
    }
    ok(sounds + ' players\' sounds on ' + Object.keys(FX_ARTIST_SOUNDS).length + ' models fit' + (wrong.length ? ': ' + wrong.slice(0, 10).join('; ') : ''), wrong.length === 0);
    {
      const b = state.blocks.pre1, bd2 = b.models.find(m => m.name === 'Chief BD2'), val = n => b.params.find(p => p.name === n).value;
      openFxInfoDialog('pre1');
      const cards = [...document.querySelectorAll('#fxiBody .fxi-start')].map(c => c.querySelector('b').textContent);
      ok('info dialog lists them: ' + cards.join(', '), cards.includes('Blues crunch') && cards.includes('John Mayer: Keeley BD-2') && cards.includes('Geese: Blues Driver'));
      ok('with the note on what is ours', /Players' sounds: the pedal is the one/.test($('fxiBody').textContent));
      document.querySelector('#fxiBody .fxi-start button[data-players][data-i="1"]').click();
      ok('Apply sets a player\'s sound: ' + [val('Gain'), val('Tone'), val('Volume')], val('Gain') === 0.5 && val('Tone') === 8.5 && val('Volume') === 5);
      ok('marked as applied', document.querySelector('#fxiBody .fxi-start button[data-players][data-i="1"]').textContent === 'Applied');
      document.querySelector('#fxiBody .fxi-start button:not([data-players])[data-i="0"]').click();
      ok('starting points still apply: ' + val('Gain'), val('Gain') === 2.5);
      closeFxInfoDialog();
      b.params = structuredClone(bd2.params); sent.length = 0; render();
    }

    // ---- the view on Pre FX 1 (Chief BD2, all controls at 5)
    const block = state.blocks.pre1, value = n => block.params.find(p => p.name === n).value;
    ok('the card\'s symbol opens it', !!document.querySelector('#block-pre1 .fx-icon.opens-focus'));
    openFxInfoDialog('pre1');
    ok('Focus view in the info dialog', !$('fxiFocus').hidden);
    $('fxiFocus').click();
    ok('from the info dialog', !$('focusOverlay').hidden && $('fxInfoOverlay').hidden);
    closeFocusView();
    document.querySelector('#block-pre1 .fx-icon.opens-focus').click(); await wait(30);
    ok('view open', !$('focusOverlay').hidden && document.querySelectorAll('#fpStage .fp-zone').length === 5);
    ok('nothing sent by opening', sent.length === 0);
    ok('centre is near', document.querySelector('#fpStage .fp-zone.near').dataset.zone === 'centre');
    moveFocusLens(0, 0); await wait(30);
    ok('top left = Sparkle boost: ' + [value('Gain'), value('Tone'), value('Volume')], value('Gain') === 1 && value('Tone') === 6 && value('Volume') === 7.5);
    ok('three writes, one per control: ' + sent.map(s => s.key).join(' '), sent.length === 3 && new Set(sent.map(s => s.key)).size === 3);
    ok('corner pill filled', document.querySelector('#fpStage .fp-zone.near').dataset.zone === '0');
    ok('list follows: ' + $('fpList').textContent.slice(0, 40), /Gain1\.0/.test($('fpList').textContent.replace(/\s/g, '')));
    moveFocusLens(1, 1); await wait(30);
    ok('bottom right = Fuzzy wall: ' + [value('Gain'), value('Tone'), value('Volume')], value('Gain') === 10 && value('Tone') === 3.5 && value('Volume') === 4.5);
    moveFocusLens(0.5, 0);
    ok('half way along the top edge: Gain ' + value('Gain') + ', Tone ' + value('Tone'), Math.abs(value('Gain') - 3.75) < 0.06 && Math.abs(value('Tone') - 6.25) < 0.06);
    moveFocusLens(0.5, 0.5);
    ok('centre = as opened: ' + [value('Gain'), value('Tone'), value('Volume')], value('Gain') === 5 && value('Tone') === 5 && value('Volume') === 5);
    sent.length = 0;
    moveFocusLens(0.5, 0.5);
    ok('no write without a change', sent.length === 0);
    // dragging on the pad
    const stage = $('fpStage'), r = stage.getBoundingClientRect();
    const ev = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: r.left + r.width * x, clientY: r.top + r.height * y }));
    stage.setPointerCapture = () => {};
    ev('pointerdown', 0.9, 0.5); ev('pointermove', 1, 0); ev('pointerup', 1, 0);
    ok('dragged to the top right = Biting crunch: ' + value('Gain'), value('Gain') === 6.5 && value('Tone') === 6.5);
    document.querySelector('#fpStage .fp-zone.bl .zn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    ok('click on a corner jumps there: ' + value('Gain'), value('Gain') === 3 && value('Tone') === 3);
    // another sound for a corner
    document.querySelector('#fpStage .fp-zone.tl .zm').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    ok('corner menu', !!$('fpMenu') && /Sparkle boost/.test($('fpMenu').textContent) && /Hairy lead/.test($('fpMenu').textContent));
    ok('players in the corner menu', /Players/.test($('fpMenu').textContent) && /John Mayer: Keeley BD-2/.test($('fpMenu').textContent));
    [...$('fpMenu').querySelectorAll('button')].find(b => /John Mayer: Keeley BD-2/.test(b.textContent)).click();
    moveFocusLens(0, 0);
    ok('a player\'s sound in the corner: ' + [value('Gain'), value('Tone')], /John Mayer/.test(document.querySelector('#fpStage .fp-zone.tl').textContent) && value('Gain') === 3 && value('Tone') === 4.5);
    document.querySelector('#fpStage .fp-zone.tl .zm').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    [...$('fpMenu').querySelectorAll('button')].find(b => /Hairy lead/.test(b.textContent)).click();
    ok('starting point in the corner', /Hairy lead/.test(document.querySelector('#fpStage .fp-zone.tl').textContent) && !$('fpMenu'));
    moveFocusLens(0, 0);
    ok('its values: ' + [value('Gain'), value('Tone')], value('Gain') === 8 && value('Tone') === 4);
    ok('kept', JSON.parse(localStorage.getItem('nanoFocusCorners'))['Chief BD2'][0].name === 'Hairy lead');
    document.querySelector('#fpStage .fp-zone.tl .zm').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    $('fpMenu').querySelector('button[data-pick="suggested"]').click();
    ok('back to the suggestion', /Sparkle boost/.test(document.querySelector('#fpStage .fp-zone.tl').textContent) && localStorage.getItem('nanoFocusCorners') === '{}');
    $('fpStart').click();
    ok('Start = as opened', value('Gain') === 5 && value('Tone') === 5);
    $('fpClose').click();
    ok('closed', $('focusOverlay').hidden && fpad.key === null);

    // ---- switches: Obsessive Drive (Peak LP left, HP right; the block starts on LP)
    const od = block.models.find(m => m.name === 'Obsessive Drive');
    block.model = od.name; block.params = structuredClone(od.params); render();
    const peak = () => block.params.find(p => p.name === 'Peak').value;
    openFocusView('pre1');
    moveFocusLens(1, 0); const right = peak();
    moveFocusLens(0.5, 0.5); const mid = peak();
    moveFocusLens(0, 1); const left = peak();
    ok('switch follows the corner: ' + [left, mid, right], right === 1 && mid === 0 && left === 0);
    // a skewed control keeps its corner value
    block.model = 'None'; render();
    ok('view closes when the block holds another model', $('focusOverlay').hidden);
    ok('no focus view on an empty slot', !document.querySelector('#block-pre1 .opens-focus'));
    const post3 = state.blocks.post3, hall = () => post3.params.find(p => p.name === 'Low Pass').value;
    openFocusView('post3'); moveFocusLens(1, 1);
    ok('Mind Hall bottom right: Low Pass ' + hall() + ' Hz', hall() === 2500);
    closeFocusView();
    // ---- the iPhone Duo: the view fills the screen, a long press on a block's tile opens it
    {
      const root = document.documentElement;
      Object.entries({ '--fold-start': '455.5px', '--fold-size': '40px', '--head-h': '82px' }).forEach(([k, v]) => root.style.setProperty(k, v));
      root.dataset.posture = 'outer'; duoUpdateLayout(); await wait(30);
      const tile = document.querySelector('#signalChain .sc-node[data-key="post3"]'), r = tile.getBoundingClientRect();
      const press = type => tile.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, clientX: r.left + 20, clientY: r.top + 20 }));
      const wasOn = state.blocks.post3.on;
      press('pointerdown'); await wait(200); press('pointerup'); tile.click(); await wait(500);
      ok('closed: a short tap only switches the block', $('focusOverlay').hidden && state.blocks.post3.on !== wasOn);
      const tile2 = document.querySelector('#signalChain .sc-node[data-key="post3"]');
      tile2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, clientX: 30, clientY: 300 })); await wait(700);
      ok('closed: a long press opens the focus view', !$('focusOverlay').hidden && fpad.key === 'post3');
      const now = state.blocks.post3.on;
      tile2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8 })); tile2.click();
      ok('... without switching the block', state.blocks.post3.on === now);
      const box = el => el.getBoundingClientRect(), stage = box($('fpStage')), side = box(document.querySelector('.fp-side'));
      ok('closed: values above the pad, nothing overlapping: ' + Math.round(side.bottom) + ' <= ' + Math.round(stage.top), side.bottom <= stage.top && stage.height > 300);
      root.dataset.posture = 'half'; root.dataset.foldAxis = 'horizontal'; duoUpdateLayout(); await wait(30);
      openFocusView('post3');
      const s2 = box($('fpStage')), l2 = box(document.querySelector('.fp-side'));
      ok('half open: values above the fold, pad below it: ' + Math.round(l2.bottom) + ' / ' + Math.round(s2.top), l2.bottom <= 455.5 && s2.top >= 495.5);
      root.dataset.foldAxis = 'vertical'; duoUpdateLayout(); await wait(30);
      openFocusView('post3');
      const s3 = box($('fpStage')), l3 = box(document.querySelector('.fp-side'));
      ok('as a book: pad left of the fold, values right of it: ' + Math.round(s3.right) + ' / ' + Math.round(l3.left), s3.right <= 455.5 && l3.left >= 495.5);
      moveFocusLens(1, 1);
      const lens = box($('fpLens'));
      ok('the larger lens stays inside the pad', lens.right <= s3.right + 1 && lens.bottom <= s3.bottom + 1 && lens.width === 60);
      closeFocusView();
      delete root.dataset.posture; delete root.dataset.foldAxis; duoUpdateLayout();
    }
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 2).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

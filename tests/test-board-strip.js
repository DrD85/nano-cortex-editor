<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  await fsLinkStart(); await new Promise(r => setTimeout(r, 400));
  const st = fsLink.settings; ok('offsets (' + [st.revB, st.revBKept, st.abB[1], st.abMode[1], st.rpNames.join('/')].join(' ') + ')', st.revB === 5001 && st.revBKept === 5004 && st.abB[1] === 18004 && st.abMode[1] === 2 && st.rpNames.join('/') === 'Room/Atmos');
  ok('bank mode', bankMode() && $('fsStrip').textContent.includes('Bank 2'));
  ok('symbol on field 3', !!$('fsStrip').querySelector('.ft[data-sw="3"] .cap svg'));
  $('fsStrip').querySelector('.ft[data-sw="5"] [data-gear]').click();
  ok('bank popover', !!$('fsPop').querySelector('select[data-act="bp"]') && $('fsPop').querySelectorAll('.swatches button').length === 10 && $('fsPop').querySelectorAll('.symbols button').length === 20);
  $('fsPop').querySelector('[data-act="bc:4"]').click(); await new Promise(r => setTimeout(r, 150));
  ok('colour sent (' + window.__board.colors.join() + ')', window.__board.colors[2] === 4 && window.__board.presets[2] === 9 && window.__board.icons[2] === 8);
  $('fsPop').querySelector('[data-act="bi:19"]').click(); await new Promise(r => setTimeout(r, 150));
  ok('symbol sent', window.__board.icons[2] === 19 && window.__board.colors[2] === 4);
  const sel = $('fsPop').querySelector('select[data-act="bp"]'); sel.value = '33'; sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 150));
  ok('preset sent', window.__board.presets[2] === 33 && (window.__lastB >> 14 & 15) === 1);
  window.__sent.length = 0; $('fsStrip').querySelector('[data-act="bank+1"]').click(); await new Promise(r => setTimeout(r, 100));
  ok('bank arrow', window.__sent.some(([t, b]) => t === 60014 && b[0] === 107 && b[1] === 1));
  document.title = out.join(' | ');
}, 1500);
</script>
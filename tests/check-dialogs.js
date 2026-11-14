<script>
setTimeout(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  writeC304 = async () => true;
  const out = [];
  try {
    metro.firmware = '2.3.0'; metroRefresh(); metroDialog();
    if (location.hash.includes('outer')) { document.documentElement.dataset.posture = 'outer'; duoUpdateLayout(); await wait(50); }
    state.blocks.pre1.on = true; render();
    try { openFxInfoDialog('pre1'); } catch (e) { out.push('fx info: ' + e.message); }
    const W = innerWidth, H = innerHeight;
    document.querySelectorAll('[id$="Overlay"]').forEach(ov => {
      const was = ov.hidden; ov.hidden = false;
      const panel = ov.firstElementChild;
      if (panel) {
        const r = panel.getBoundingClientRect();
        const scrolls = [panel, ov].some(e => /auto|scroll/.test(getComputedStyle(e).overflowY)) || [...panel.children].some(c => /auto|scroll/.test(getComputedStyle(c).overflowY) && c.scrollHeight > c.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(c).overflowY));
        const cut = r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1;
        if (cut) out.push(ov.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + (scrolls ? ' (scrolls inside)' : ' CUT OFF, no scrolling'));
      }
      ov.hidden = was;
    });
  } catch (e) { out.push('ERROR ' + e.message); }
  document.title = innerWidth + 'x' + innerHeight + ' || ' + (out.join(' || ') || 'all dialogs fit');
}, 1500);
</script>

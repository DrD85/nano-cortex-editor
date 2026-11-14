<script>
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const kept = () => JSON.parse(localStorage.getItem('nanoCtlAutoBackups') || '[]');
  try {
    localStorage.removeItem('nanoCtlAutoBackups');
    await fsLinkStart(); await wait(600);
    ok('scheduled after the sync', Boolean(autoBackup.timer));
    clearTimeout(autoBackup.timer);
    await autoBackupRun(); await wait(50);
    let list = kept();
    ok('first backup kept: ' + list.length + ' with ' + (list[0] && list[0].entries.length) + ' entries, firmware ' + (list[0] && list[0].firmware),
      list.length === 1 && list[0].entries.length === 3 && list[0].firmware === '1.21.0' && list[0].format === 'nano-cortex-controller-settings');
    ok('long value whole (400 bytes)', atob(list[0].entries.find(e => e.key === 'banks').value).length === 400);
    const first = list[0].created;
    await wait(20); await autoBackupRun(); await wait(50);
    list = kept();
    ok('unchanged store: still one, seen again', list.length === 1 && list[0].created === first && list[0].checked !== first);
    autoBackupSchedule();
    ok('not scheduled again within 12 hours', !autoBackup.timer);
    for (let i = 0; i < 11; i++) { window.__board.store[2] = { key: 'metro', value: [0, 2, 0, 0, i] }; await autoBackupRun(); await wait(10); }
    list = kept();
    ok('ten different states kept, newest first: ' + list.length, list.length === 10 && atob(list[0].entries.find(e => e.key === 'metro').value).charCodeAt(4) === 10);
    // the list
    showControllerMenu();
    ok('menu entry shown', !$('ctlAutoBtn').hidden);
    openAutoBackups(); await wait(20);
    const rows = document.querySelectorAll('#autoBackupRows .ab-row');
    ok('list shows ' + rows.length + ' rows', rows.length === 10 && !$('autoBackupOverlay').hidden);
    // restore the oldest kept one
    askConfirm = async () => true;
    const want = list[9];
    rows[9].querySelector('[data-act="restore"]').click(); await wait(1500);
    const now = window.__board.store;
    const same = now.length === want.entries.length && want.entries.every(e => { const b = now.find(x => x.key === e.key); return b && btoa(String.fromCharCode(...b.value)) === e.value; });
    ok('restore wrote the chosen backup back (' + now.length + ' entries)', same && $('autoBackupOverlay').hidden);
    // without the controller: the list stays reachable for "Save as file", restore is off
    state.viaController = false; showControllerMenu(); openAutoBackups(); await wait(20);
    ok('offline: list reachable, restore disabled', !$('ctlAutoBtn').hidden && document.querySelector('#autoBackupRows [data-act="restore"]').disabled && !document.querySelector('#autoBackupRows [data-act="file"]').disabled);
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 2).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

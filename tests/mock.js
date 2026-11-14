<script>
(function () {
  writeC304 = async () => true;
  state.connected = true;
  setStatus('Connected', true);
  const put = (key, model, on) => {
    const b = state.blocks[key]; const m = b.models.find(x => x.name === model);
    b.model = m.name; b.params = structuredClone(m.params); b.on = on;
  };
  put('pre1', 'Chief BD2', true);
  put('pre2', 'Opto Comp (M)', false);
  put('post1', 'Chief DC2W (ST)', true);
  put('post2', 'Tape Delay', true);
  put('post3', 'Mind Hall', true);
  state.gate.on = true;
  state.currentCapture.name = 'AATR SX3 Clean BAL2 DI';
  state.currentIR.shortName = '212 US TWN C12Q 00s';
  const v = new URLSearchParams(location.search);
  try { localStorage.setItem('nanoView', JSON.stringify({ look: v.get('look') || 'bars', view: v.get('view') || 'full', focus: v.get('focus') || 'post2' })); } catch (e) {}
  Object.assign(viewPrefs, { look: v.get('look') || 'bars', view: v.get('view') || 'full', focus: v.get('focus') || 'post2' });
  applyView();
  render();
})();
</script>

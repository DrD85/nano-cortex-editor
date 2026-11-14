<script>
(function () {
  // a fake board on the controller link
  const sent = [];
  window.__sent = sent;
  const board = { fxp: { 9012: null }, layout: { count: 8, order: [1,2,3,4,5,6,7,8], switch1: 0 }, fx: location.search.includes('fx=1'), bank: 1, presets: [7, 0, 9, 0, 0, 12], colors: [2, 0, 6, 0, 0, 8], icons: [3, 0, 8, 0, 0, 14] };
  const T = (s) => [...new TextEncoder().encode(s)];
  const txt = s => [T(s).length, ...T(s)];
  const frame = (type, body) => { const b = [...body, type & 255, (type >> 8) & 255, (type >> 16) & 255, (type >> 24) & 255]; return Uint8Array.from([b.length & 255, 0xC0 | ((b.length >> 8) & 0x3F), ...b]); };
  const deliver = (type, body) => setTimeout(() => { const d = frame(type, body); if (!ctlPacket(d)) console.log('not taken', type); }, 5);
  const tile = (sw, flags, color, caption, name, note, rows, row) => [sw, flags, color & 255, (color >> 8) & 255, (color >> 16) & 255, row & 255, ...txt(caption), ...txt(name), ...txt(note), ...txt(rows[0]), ...txt(rows[1])];
  const settings = () => { const b = [board.layout.count, ...board.layout.order, board.layout.switch1, board.fx ? 1 : 0, 4, 1, 0, 0];
    const words = [5001, 5004, 0, 18004, 0, 0, 0]; words.forEach(w => b.push(w & 255, (w >> 8) & 255, (w >> 16) & 255, w >>> 24)); b.push(0,2,0,0,0); b.push(...txt('Room'), ...txt('Atmos')); b.push(board.bank, ...board.presets, ...board.colors, ...board.icons, 0, 0, 0); return b; };
  writeC304 = async (label, payload) => {
    const n = payload.length, type = (payload[n-4] | payload[n-3] << 8 | payload[n-2] << 16 | payload[n-1] << 24) >>> 0, body = [...payload.slice(2, n - 4)];
    sent.push([type, body]);
    if (type === 60010) {
      deliver(60011, tile(1, 0, 0xBDBDBD, 'MODE', 'FX', 'Hold: Looper', ['', ''], -1));
      deliver(60011, tile(2, 0, 0xBDBDBD, 'TUNER', 'Tuner', 'Hold: Scenes', ['', ''], -1));
      ['Chief BD2', 'Opto Comp (M)', 'Chief DC2W (ST)', 'Tape Delay', 'Mind Hall'].forEach((n, i) => deliver(60011, tile(3 + i, i === 1 ? 0 : 1, [0xFF6B00, 0x2E7D32, 0x3D00FF, 0x00F5D4, 0x00F5D4][i], ['Pre FX 1', 'Pre FX 2', 'Post FX 1', 'Post FX 2', 'Post FX 3'][i], n, '', ['', ''], -1)));
      deliver(60011, tile(8, 1 | 4 | 8, 0x00F5D4, 'REV A / B', '', '', ['A  Mind Hall', 'B  Room'], 0));
      deliver(60013, settings());
    } else if (type === 60014) { deliver(60015, [1]); if (body[0] === 66) { const a = (body[1] | body[2] << 8 | body[3] << 16 | body[4] << 24) >>> 0; const i = (a >> 11) & 7; board.presets[i] = a & 127; board.colors[i] = (a >> 7) & 15; board.icons[i] = (a >> 18) & 31; window.__lastB = a; deliver(60013, settings()); } if (body[0] === 93) { const a = body[1] | body[2] << 8 | body[3] << 16 | body[4] << 24; board.layout.count = (a >>> 24) & 15; board.layout.switch1 = (a >>> 28) & 3; board.layout.order = [...Array(8)].map((_, p) => ((a >>> (3 * p)) & 7) + 1); deliver(60013, settings()); } }
    else if (type === 60018) { const types = Object.keys(board.fxp).filter(k => board.fxp[k]).map(Number); deliver(60019, [types.length, 0, ...types.flatMap(t => [t & 255, (t >> 8) & 255, (t >> 16) & 255, t >>> 24])]); }
    else if (type === 60016) { const t = body[0] | body[1] << 8 | body[2] << 16 | body[3] << 24; deliver(60017, [...body.slice(0, 4), ...(board.fxp[t] || new Array(264).fill(0))]); }
    else if (type === 60020) { const t = body[0] | body[1] << 8 | body[2] << 16 | body[3] << 24; board.fxp[t] = body.slice(4); deliver(60021, [1]); }
    return true;
  };
  window.__board = board;
  // the board has two Tape Delay presets (model 9012?) - set from the editor's own encoder
  const tape = state.blocks.post2.models.find(m => m.name === 'Tape Delay');
  window.__tapeType = modelType(tape);
  board.fxp = {};
  board.fxp[window.__tapeType] = [...fxpEncode([{ name: 'Slapback', values: [0.3, 0.2, 0.5] }, { name: 'Ambient', values: [0.6, 0.7] }])];
  // the editor already has its own favourite for Tape Delay and Mind Hall
  localStorage.setItem('nanoFxPresetLib', JSON.stringify({ 'Tape Delay': [{ id: 'a', name: 'Mine', values: [0.1, 0.1], fav: true }, { id: 'b', name: 'Ambient', values: [0.9], fav: true }],
    'Mind Hall': [{ id: 'c', name: 'Big', values: [0.8, 0.8], fav: true }] }));
  state.viaController = true;
})();
</script>

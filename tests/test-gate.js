<script>
// The input gate: its amount comes from the Nano's state (field 53, a float 0-1, left out at 0) and goes to the Nano
// as 0-255. The pairs "sent -> reported" were measured on a Nano Cortex with NanOS 2.3.0.
setTimeout(async () => {
  const out = []; const ok = (n, c) => out.push((c ? 'PASS ' : 'FAIL ') + n);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sent = [];
  writeC304 = async (label, frame) => { sent.push({ label, bytes: Array.from(frame) }); return true; };
  const hx = a => a.map(b => b.toString(16).padStart(2, '0')).join(' ');
  const num = (n, v) => [...encodeVarint(n << 3), ...encodeVarint(v)];
  const flt = (n, v) => [...encodeVarint((n << 3) | 5), ...float32LE(v)];
  // a state as the Nano sends it, with the message type at its end
  const feed = extra => {
    state.stateBytes = [...num(1, 1), ...num(3, 198), ...num(4, 248), ...num(5, 127), ...num(6, 127), ...num(7, 127), ...num(9, 2), ...num(13, 32), ...extra, 2, 0, 0, 0];
    parseBufferedCurrentState();
  };
  const amount = () => state.gate.params[0].value;
  const shown = () => { const el = document.getElementById('gateParams'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
  try {
    ok('before any state the knob stands at 50: ' + amount(), amount() === 50);
    feed([...flt(53, 0.3), ...num(54, 1)]);
    ok('0.3 and bypassed: off, 30 % (' + amount() + ')', amount() === 30 && state.gate.on === false);
    ok('the knob shows it: ' + shown(), /30\s*%/.test(shown()));
    feed([]);
    ok('no field 53, no bypass: on, 0 % (' + amount() + ')', amount() === 0 && state.gate.on === true);
    ok('the knob shows 0 %: ' + shown(), /(^|\D)0\s*%/.test(shown()));
    const reported = [[54, 0.211765, 21], [108, 0.423529, 42], [128, 0.501961, 50], [158, 0.619608, 62], [208, 0.815686, 82], [255, 1, 100]];
    for (const [raw, value, percent] of reported) {
      feed([...flt(53, value)]);
      ok('the Nano reports ' + value + ' for ' + raw + ': ' + amount() + ' %', amount() === percent);
    }
    feed([...flt(53, 0.342668)]);
    ok('0.342668 from the Nano: 34 % (' + amount() + ')', amount() === 34);
    feed([...num(53, 7)]);
    ok('a field 53 of another kind leaves the knob alone: ' + amount(), amount() === 34);

    // what the editor sends
    const frame = async percent => { sent.length = 0; await setGateReduction(percent); return hx(sent[0].bytes); };
    ok('0 % goes out as 0: ' + await frame(0), await frame(0) === '0a c0 18 0b 20 00 28 00 1a 00 00 00');
    ok('21 % goes out as 54: ' + await frame(21), await frame(21) === '0a c0 18 0b 20 36 28 00 1a 00 00 00');
    ok('50 % goes out as 128: ' + await frame(50), await frame(50) === '0b c0 18 0b 20 80 01 28 00 1a 00 00 00');
    ok('100 % goes out as 255: ' + await frame(100), await frame(100) === '0b c0 18 0b 20 ff 01 28 00 1a 00 00 00');
    let back = 0;
    for (let percent = 0; percent <= 100; percent++) {
      const raw = Math.round(percent * 255 / 100);
      if (Math.round(Math.fround(raw / 255) * 100) === percent) back++;
    }
    ok('every percent comes back as itself from the Nano: ' + back + ' of 101', back === 101);

    // a state that crossed an own change does not move the knob
    await wait(700);
    feed([...flt(53, 0.1)]);
    ok('10 % from the Nano: ' + amount(), amount() === 10);
    state.gate.params[0].value = 80; await setGateReduction(80);
    feed([...flt(53, 0.1)]);
    ok('right after an own change the old state is ignored: ' + amount(), amount() === 80);
    await wait(700);
    feed([...flt(53, 0.8)]);
    ok('later the Nano counts again: ' + amount(), amount() === 80);
    feed([...flt(53, 0.6)]);
    ok('and a change on the Nano arrives: ' + amount(), amount() === 60);

    // preset files
    const file = (editor, reduction) => gateReductionOfFile({ editor, gate: { on: true, reduction } });
    ok('file of 1.19.1: as written (' + file('1.19.1', 50) + ', ' + file('1.19.1', 7) + ')', file('1.19.1', 50) === 50 && file('1.19.1', 7) === 7);
    ok('file of 1.20.0 and 2.0.0: as written', file('1.20.0', 12) === 12 && file('2.0.0', 99) === 99);
    ok('older file, knob never moved (50): no amount', file('1.18.0', 50) === null && file('1.19.0', 50) === null && file(undefined, 50) === null);
    ok('older file, knob at 0: the Nano had 42 % (' + file('1.18.0', 0) + ')', file('1.18.0', 0) === 42);
    ok('older file, knob at 100: the Nano had 82 % (' + file('1.19.0', 100) + ')', file('1.19.0', 100) === 82);
    ok('older file, knob at 30: the Nano had 54 % (' + file('1.4.0', 30) + ')', file('1.4.0', 30) === 54);
    ok('a file without a gate amount: none', gateReductionOfFile({ editor: '1.19.1', gate: { on: true } }) === null && gateReductionOfFile({ editor: '1.19.1' }) === null);
  } catch (e) { out.push('ERROR ' + e.stack.split('\n').slice(0, 3).join(' ')); }
  document.title = out.join(' | ');
}, 1500);
</script>

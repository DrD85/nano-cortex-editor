<script>
window.audSetup = () => {
  const mk = (name, kind, type, author, i) => ({ index: i, name, type, version: '2', tags: [], instrument: 'guitar', author, description: '', corrupted: false, kind });
  state.library = { factory: [mk('AATR SX3 Clean BAL2 DI', 'factory', 'clean', 'Amalgam Audio', 0), mk('AATR SX3 Edge WRM3 DI', 'factory', 'crunch', 'Amalgam Audio', 1),
    mk('Bassman 59 Edge', 'factory', 'crunch', 'Neural DSP', 2), mk('Brit 800 Drive', 'factory', 'highgain', 'Neural DSP', 3), mk('Cali Rect Lead', 'factory', 'highgain', 'Neural DSP', 4),
    mk('Deluxe Rev Clean', 'factory', 'clean', 'Neural DSP', 5), mk('Dumble ODS Lead', 'factory', 'lead', 'Neural DSP', 6)],
    user: [mk('TwoRock Clean', 'user', 'clean', '', 0)], irFactory: [], irUser: [], loaded: true, requested: true };
  openLibraryBrowser();
};
window.AUD_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
window.AUD_STOP = '<svg viewBox="0 0 24 24" width="12" height="12"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
window.AUD_EQ = '<span class="aud-eq"><i></i><i></i><i></i></span>';
window.AUD_CSS = `
  .aud-eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
  .aud-eq i { width: 3px; background: #45F862; border-radius: 1px; } .aud-eq i:nth-child(1){height:60%} .aud-eq i:nth-child(2){height:100%} .aud-eq i:nth-child(3){height:40%}
  .aud-play { width: 32px; height: 32px; border-radius: 50%; border: 1px solid #3a3f45; background: transparent; color: #e6e8ea; display: grid; place-items: center; }
  .aud-play.on { background: #45F862; border-color: #45F862; color: #0b0b0b; }
  .lib-item.aud { border-color: #45F862; background: color-mix(in srgb, #45F862 10%, #0d0d0d); }
  .aud-live { font-size: 11px; font-weight: 600; letter-spacing: .08em; color: #7ff593; display: inline-flex; align-items: center; gap: 6px; text-transform: uppercase; }
  .aud-btn { padding: 7px 12px; border-radius: 9px; border: 1px solid #3a3f45; background: #16191c; color: #f2f2f2; font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
  .aud-btn.primary { background: #f2f2f2; color: #0b0b0b; border-color: #f2f2f2; }`;
</script>

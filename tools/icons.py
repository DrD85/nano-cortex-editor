"""Block icons for the editor (own drawings, 24x24 line icons).

The editor uses them as CSS masks, so only the shape matters (they are tinted with
the block colour). Run `python3 tools/icons.py` to print the CSS variables.
"""

S = 'fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'

ICONS = {
    # Effects
    'overdrive': '<path d="M2 12h3l2-6h5l2 6h0l2 6h5l2-6"/>',                               # clipped wave
    'bass-overdrive': '<path d="M2 12c2 0 3-7 6-7h4c3 0 4 14 7 14h3"/><path d="M5 21h14"/>',
    'fuzz': '<path d="M2 17h4V7h6v10h6V7h4"/>',                                               # square wave
    'compressor': '<path d="M12 2v6m-3-3 3 3 3-3"/><path d="M12 22v-6m-3 3 3-3 3 3"/><path d="M3 12h18"/>',
    'equalizer': '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="6" width="4" height="3" rx="1"/><rect x="16" y="10" width="4" height="3" rx="1"/>',
    'filter': '<path d="M2 8h9c3 0 4 2 5 5s2 7 6 7"/><path d="M2 20h20" stroke-dasharray="1 3"/>',
    'wah': '<path d="M4 19h16"/><path d="M5 15l14-7"/><path d="M6 19l-1-4M18 19l1-11"/>',     # rocker pedal
    'utility': '<path d="M3 7h10M17 7h4M3 17h4M11 17h10"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    'gate': '<path d="M2 12c1-5 2-5 3 0s2 5 3 0"/><path d="M8 12h8"/><path d="M16 12c1-5 2-5 3 0s2 5 3 0"/><path d="M11 6v12M13 6v12"/>',
    'doubler': '<path d="M2 10c3-6 6-6 9 0s6 6 9 0"/><path d="M4 15c3-6 6-6 9 0s6 6 9 0"/>',
    'pitch': '<path d="M3 19.5h4.5V15H12v-4.5h4.5V6H21"/>',                                  # steps: transpose
    'modulation': '<path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0 3.5-5 5-3"/>',                    # sine
    'delay': '<path d="M4 6v12M10 9v6M15 11v2M19.5 11.5v1"/>',                                # decaying repeats
    'reverb': '<circle cx="5" cy="12" r="1.5"/><path d="M9 8a6 6 0 0 1 0 8M13 5a10 10 0 0 1 0 14M17 2a14 14 0 0 1 0 20"/>',
    # Signal chain
    'capture': '<circle cx="12" cy="12" r="9"/><path d="M5 12c2-4 3-4 4.5 0s2.5 4 4.5 0 3-4 5 0"/>',
    'cab': '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><circle cx="12" cy="13" r="1"/>',
    'amp': '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 11h20"/><circle cx="7" cy="14.5" r="1"/><circle cx="12" cy="14.5" r="1"/><circle cx="17" cy="14.5" r="1"/>',
    'tuner': '<path d="M8 2v8a4 4 0 0 0 8 0V2"/><path d="M12 14v8"/>',                        # tuning fork
    'exp': '<path d="M3 21h18"/><path d="M5 18l14-5"/><path d="M5 21v-3M19 21v-8"/><path d="M6 9a9 9 0 0 1 12-4"/><path d="M15 3l3 2-2 3"/>',
    'midi': '<circle cx="12" cy="12" r="9"/><path d="M10 3.5h4"/><circle cx="7" cy="12" r="0.6"/><circle cx="17" cy="12" r="0.6"/><circle cx="8.5" cy="8.5" r="0.6"/><circle cx="15.5" cy="8.5" r="0.6"/><circle cx="12" cy="16.5" r="0.6"/>',
    'export': '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    'import': '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>',
    # Toolbar
    'save': '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="5" rx="1"/>',
    'rename': '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    'left': '<path d="M15 5l-7 7 7 7"/>',
    'right': '<path d="M9 5l7 7-7 7"/>',
    'more': '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    'library': '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16 5l3.5-1 3 15.5-3.5 1z"/>',
    'controller': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="15" r="1.4"/><circle cx="12" cy="15" r="1.4"/><circle cx="16" cy="15" r="1.4"/><path d="M7 9h10"/>',
    'refresh': '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    'power': '<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>',
    'close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h0"/>',
    'bluetooth': '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
    # Cab microphones (own drawings of the mic types, side view)
    'mic-57': '<path d="M9 2.5h6l-.6 6.5h-4.8z"/><path d="M9.3 5.5h5.4"/><path d="M10.2 9l.8 12.5h2l.8-12.5"/>',
    'mic-421': '<rect x="6.5" y="2.5" width="11" height="8" rx="2"/><path d="M9.5 5v3M12 5v3M14.5 5v3"/><path d="M10 10.5l.5 11h3l.5-11"/>',
    'mic-184': '<rect x="10" y="2.5" width="4" height="19" rx="1.6"/><path d="M10 6.5h4"/>',
    'mic-414': '<rect x="7.5" y="2.5" width="9" height="10.5" rx="2.5"/><path d="M7.5 7.75h9"/><path d="M10.5 13v8.5h3V13"/>',
    'mic-160': '<path d="M9.5 2.5h5v8a2.5 2.5 0 0 1-5 0z"/><path d="M9.5 5.5h5"/><path d="M11 13v8.5h2V13"/>',
    'keyboard': '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0M9 14h6"/>',
    'unknown': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h0"/>',
    # Capture types
    'cap-amp-head': '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M2 12h20"/><circle cx="6" cy="14.5" r="0.8"/><circle cx="10" cy="14.5" r="0.8"/><circle cx="14" cy="14.5" r="0.8"/><circle cx="18" cy="14.5" r="0.8"/>',
    'cap-amp-combo': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><circle cx="12" cy="14.5" r="4"/>',
    'cap-amp-cab': '<rect x="3" y="2" width="18" height="6" rx="1.5"/><rect x="3" y="10" width="18" height="12" rx="1.5"/><circle cx="8.5" cy="16" r="2.5"/><circle cx="15.5" cy="16" r="2.5"/>',
    'cap-cab': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><circle cx="8" cy="16" r="2.5"/><circle cx="16" cy="16" r="2.5"/>',
    'cap-pedal': '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="12" cy="17" r="2"/>',
    'cap-overdrive': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M7 12h2l1.5-3h3L15 12h2"/><circle cx="12" cy="17.5" r="1.5"/>',
}


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g {S}>{body}</g></svg>'


def data_uri(body):
    # Single quotes inside the SVG (the CSS uses url("...")) and '#' must be percent-encoded.
    from urllib.parse import quote
    return 'data:image/svg+xml,' + quote(svg(body).replace('"', "'"), safe=" =:/'<>-.,")


if __name__ == '__main__':
    for name, body in ICONS.items():
        print(f'      --ico-{name}: url("{data_uri(body)}");')

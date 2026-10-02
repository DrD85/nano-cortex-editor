# Nano Cortex Editor (unofficial)

A desktop editor for the **Neural DSP Nano Cortex** that talks to the pedal over Bluetooth.
It runs in Chrome/Edge (Web Bluetooth) or as a Mac app.

> **Unofficial community project.** Not affiliated with, endorsed by or supported by Neural DSP.
> "Nano Cortex", "Quad Cortex" and "Neural DSP" are trademarks of Neural DSP Technologies.
> The editor writes to your device. Use it at your own risk and keep backups of your presets
> (for example with the official Cortex Cloud app).

![Screenshot](docs/screenshot.png)

## Features

- **Presets**: switch presets over Bluetooth (no USB cable needed), rename, save; follows preset changes made on the pedal
- **Amp, gate and FX blocks**: all knobs with live, lag-free updates, model selection for Pre FX 1–2 and Post FX 1–3, block colours per effect category (Quad Cortex style)
- **Captures**: 25 capture slots plus the capture library on the device, with a browser for categories, instruments, tags and search; load library captures into a slot
- **Cab/IR**: slots, level, high/low pass, mic and position; load factory or user IRs from the device library into a slot
- **Tuner**: note and cents display, reference pitch (400–480 Hz), mute
- **Expression pedal**: per-preset assignments for Gain, Bass, Mid, Treble, Level, Gate and FX amounts (min/max, invert) and bypass switching (Heel-Toe, Switch, Stop)
- Log export for troubleshooting

## Use it

### In the browser

Open `index.html` in **Chrome** or **Edge** on macOS or Windows, click **Connect** and choose your Nano Cortex.
Safari and Firefox do not support Web Bluetooth.

If GitHub Pages is enabled for this repository, the editor also runs directly from
`https://<user>.github.io/<repository>/` without downloading anything.

### Mac app

Download the zip from [Releases](../../releases), unzip it and move **Nano Cortex Editor.app** to *Applications*.
The app is not signed with an Apple Developer ID. On the first start, right-click it and choose **Open**.
If macOS says the app is damaged, run `xattr -cr "/Applications/Nano Cortex Editor.app"` once in Terminal.
macOS asks for Bluetooth access when you connect for the first time.

## Build the Mac app

Requires [Node.js](https://nodejs.org) on an Apple Silicon Mac.

```bash
cd mac-app
./build.sh            # app for yourself, includes pedal pictures from ../img if present
./build.sh --public   # release build without pedal pictures, plus a zip in ../release
```

The app is a small [Electron](https://www.electronjs.org) shell around `index.html`
(Safari/WKWebView has no Web Bluetooth). It connects to the first Bluetooth device whose name contains
"Nano" or "Cortex".

## Pedal pictures (optional)

The editor can show a picture for each effect model. The pictures are not part of this repository.
Put your own PNG files into an `img/` folder next to `index.html`, using the file names listed in
`MODEL_IMAGES` inside `index.html`. Missing pictures are simply not shown.

## How it works

The Nano Cortex exposes a Bluetooth LE service with a write characteristic (`c304`) and a notify
characteristic (`c305`). Messages are protobuf payloads framed as
`[length] C0 [payload] [32-bit little-endian message type]`; larger replies are split into several packets.
The message layouts used here are documented in comments in `index.html`.

## Credits

- [rixrix/deskop-nano-cortex](https://github.com/rixrix/deskop-nano-cortex) (Apache-2.0): its protocol
  notes helped with the state dump layout and the preset-change acknowledgement.

## License

[MIT](LICENSE)

---

## Deutsch (Kurzfassung)

Inoffizieller Editor für den Neural DSP Nano Cortex per Bluetooth. Er läuft in Chrome/Edge oder als Mac-App.
Du kannst Presets wechseln, umbenennen und speichern und Amp, Gate und Effekte live bearbeiten.
Captures und Cabs lädst du aus der Library des Geräts. Dazu gibt es einen Tuner und die Zuweisungen
für das Expression-Pedal.
Die Mac-App gibt es unter *Releases*. Sie ist nicht signiert: Starte sie beim ersten Mal per Rechtsklick → **Öffnen**.
Der Editor schreibt auf dein Gerät, die Nutzung erfolgt auf eigene Gefahr.

// Nano Cortex Editor - macOS app shell (Electron) around the web editor.
// The editor itself is app/index.html (copied from ../index_final_fixed.html by build.sh).
const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Zoom like in Chrome: Cmd + / Cmd - step through these factors, Cmd 0 returns to 100 %. The zoom is kept for the next start.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (err) { return {}; }
}

function writeSettings(settings) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (err) { /* not important enough to fail */ }
}

function nextZoom(current, direction) {
  if (direction === 0) return 1;
  const steps = direction > 0 ? ZOOM_STEPS : ZOOM_STEPS.slice().reverse();
  return steps.find(step => (direction > 0 ? step > current + 0.001 : step < current - 0.001)) || steps[steps.length - 1];
}

function zoom(win, direction) {
  if (!win) return;
  const factor = nextZoom(win.webContents.getZoomFactor(), direction);
  win.webContents.setZoomFactor(factor);
  writeSettings({ ...readSettings(), zoom: factor });
}

// The shortcuts are handled in before-input-event (by the typed character, so they work with any keyboard layout);
// the menu shows them without registering them a second time.
function buildMenu() {
  const focused = () => BrowserWindow.getFocusedWindow();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Actual Size', accelerator: 'CommandOrControl+0', registerAccelerator: false, click: () => zoom(focused(), 0) },
        { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', registerAccelerator: false, click: () => zoom(focused(), 1) },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', registerAccelerator: false, click: () => zoom(focused(), -1) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    { role: 'windowMenu' }
  ]));
}

// Electron has no Bluetooth device chooser like Chrome, so the Nano Cortex is picked
// automatically from the scan results ("Mini Board Nano Cortex", "Nano Cortex", ...).
const DEVICE_NAME = /cortex|nano/i;
const SCAN_TIMEOUT_MS = 20000;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    title: 'Nano Cortex Editor',
    backgroundColor: '#000000',
    // No title bar: the window buttons sit in the editor's top bar (the page leaves room for them and lets the
    // bar move the window), centred on its first row.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 27 },
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  let pendingSelection = null;
  let scanTimer = null;

  // Fires repeatedly while navigator.bluetooth.requestDevice() is scanning.
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();

    if (!pendingSelection) {
      pendingSelection = callback;
      scanTimer = setTimeout(() => {
        if (pendingSelection) pendingSelection(''); // cancels requestDevice()
        pendingSelection = null;
      }, SCAN_TIMEOUT_MS);
    }

    const nano = devices.find(device => DEVICE_NAME.test(device.deviceName || ''));
    if (nano) {
      clearTimeout(scanTimer);
      pendingSelection(nano.deviceId);
      pendingSelection = null;
    }
  });

  // Cmd + (also Cmd = and the keypad +), Cmd -, Cmd 0
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.meta || input.control) || input.alt) return;
    const direction = { '+': 1, '=': 1, '-': -1, '0': 0 }[input.key];
    if (direction === undefined) return;
    event.preventDefault();
    zoom(win, direction);
  });

  win.webContents.on('did-finish-load', () => {
    const saved = Number(readSettings().zoom);
    if (ZOOM_STEPS.includes(saved)) win.webContents.setZoomFactor(saved);
  });

  // In full screen the window buttons are hidden, so the top bar needs no room for them.
  const markFullScreen = on => win.webContents.executeJavaScript(
    "document.documentElement.classList.toggle('fullscreen', " + on + ')').catch(() => {});
  win.on('enter-full-screen', () => markFullScreen(true));
  win.on('leave-full-screen', () => markFullScreen(false));

  // Open external links in the default browser instead of a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

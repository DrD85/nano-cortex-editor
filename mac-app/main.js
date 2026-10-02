// Nano Cortex Editor - macOS app shell (Electron) around the web editor.
// The editor itself is app/index.html (copied from ../index_final_fixed.html by build.sh).
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

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

  // Open external links in the default browser instead of a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

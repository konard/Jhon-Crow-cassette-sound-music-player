// Cassette Music Player - Main Process
// Electron main process for the standalone cassette music player

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window objects
let mainWindow = null;
let splashWindow = null;
let tray = null;
let isPlaying = false;

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm', '.opus', '.wma'];

// Create play/pause tray icons programmatically
function createTrayIcon(type) {
  // Create a simple icon using nativeImage from raw RGBA data
  const iconSize = 16;
  const buffer = Buffer.alloc(iconSize * iconSize * 4);

  // Fill with transparent background
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 0;     // R
    buffer[i + 1] = 0; // G
    buffer[i + 2] = 0; // B
    buffer[i + 3] = 0; // A (transparent)
  }

  // Draw icon based on type
  if (type === 'play') {
    // Draw play triangle (pointing right)
    for (let y = 0; y < iconSize; y++) {
      const rowWidth = Math.floor((y < iconSize / 2) ? (y * 2 / iconSize * 10) : ((iconSize - y) * 2 / iconSize * 10));
      const startX = 3;
      for (let x = startX; x < startX + rowWidth && x < iconSize - 2; x++) {
        const idx = (y * iconSize + x) * 4;
        buffer[idx] = 124;     // R - green color matching app theme
        buffer[idx + 1] = 252; // G
        buffer[idx + 2] = 124; // B
        buffer[idx + 3] = 255; // A
      }
    }
  } else {
    // Draw pause bars (two vertical rectangles)
    for (let y = 2; y < iconSize - 2; y++) {
      // Left bar
      for (let x = 3; x < 6; x++) {
        const idx = (y * iconSize + x) * 4;
        buffer[idx] = 124;     // R
        buffer[idx + 1] = 252; // G
        buffer[idx + 2] = 124; // B
        buffer[idx + 3] = 255; // A
      }
      // Right bar
      for (let x = 10; x < 13; x++) {
        const idx = (y * iconSize + x) * 4;
        buffer[idx] = 124;     // R
        buffer[idx + 1] = 252; // G
        buffer[idx + 2] = 124; // B
        buffer[idx + 3] = 255; // A
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: iconSize, height: iconSize });
}

// Create tray with current state icon
function createTray() {
  const icon = isPlaying ? createTrayIcon('pause') : createTrayIcon('play');
  tray = new Tray(icon);
  tray.setToolTip('Cassette Music Player');

  // Single click toggles play/pause
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.webContents.send('tray-toggle-play');
    }
  });

  // Double click shows/hides window
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// Update tray icon based on play state
function updateTrayIcon() {
  if (tray) {
    const icon = isPlaying ? createTrayIcon('pause') : createTrayIcon('play');
    tray.setImage(icon);
    tray.setToolTip(isPlaying ? 'Cassette Music Player - Playing' : 'Cassette Music Player - Paused');
  }
}

// Create splash window with loading progress bar
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js')
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

  // Prevent window from being closed during loading
  splashWindow.on('close', (e) => {
    if (mainWindow && !mainWindow.isVisible()) {
      e.preventDefault();
    }
  });

  return splashWindow;
}

// Update splash screen progress
function updateSplashProgress(progress, message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-progress', progress, message);
  }
}

// Close splash window when main window is ready
function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  // Create the browser window with transparent, frameless design
  // Start hidden until fully loaded to avoid showing blank window
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 400,
    minHeight: 320,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,  // Start hidden
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Update splash progress when window starts loading
  updateSplashProgress(10, 'Initializing window...');

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Update splash progress when DOM is ready
  mainWindow.webContents.on('dom-ready', () => {
    updateSplashProgress(40, 'Loading 3D engine...');
  });

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle minimize - hide to tray instead
  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  // Remove default menu for cleaner look
  Menu.setApplicationMenu(null);
}

// Create window when Electron is ready
app.whenReady().then(() => {
  // Show splash screen immediately for fast visual feedback
  createSplashWindow();

  // Small delay to ensure splash is visible before heavy work
  setTimeout(() => {
    updateSplashProgress(5, 'Starting application...');
    createWindow();
    createTray();
  }, 100);
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers for file operations

// Open folder dialog and return audio files
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Music Folder'
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const folderPath = result.filePaths[0];
  const audioFiles = getAudioFilesFromFolder(folderPath);

  return {
    folderPath,
    audioFiles
  };
});

// Open file dialog and return selected audio files
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Select Audio Files',
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'opus'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const audioFiles = result.filePaths
    .filter(filePath => isAudioFile(filePath))
    .map(filePath => ({
      name: getFileDisplayName(filePath),
      fullName: path.basename(filePath),
      path: filePath
    }));

  return {
    folderPath: path.dirname(result.filePaths[0]),
    audioFiles
  };
});

// Get audio files from a folder
function getAudioFilesFromFolder(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    return files
      .filter(file => isAudioFile(file))
      .map(file => ({
        name: getFileDisplayName(file),
        fullName: file,
        path: path.join(folderPath, file)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error reading folder:', error);
    return [];
  }
}

// Check if file is an audio file
function isAudioFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

// Get display name (remove extension and clean up)
function getFileDisplayName(filename) {
  const basename = path.basename(filename);
  const ext = path.extname(basename);
  return basename.slice(0, -ext.length);
}

// Window control handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Drag window by cassette - track start position
let dragStartPosition = null;

ipcMain.on('window-start-drag', () => {
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    dragStartPosition = { x, y };
  }
});

// Move window by delta from mouse movement
ipcMain.on('window-move', (event, deltaX, deltaY) => {
  if (mainWindow && dragStartPosition) {
    const [currentX, currentY] = mainWindow.getPosition();
    mainWindow.setPosition(currentX + deltaX, currentY + deltaY);
  }
});

// Always on top handlers
ipcMain.on('set-always-on-top', (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
  }
});

ipcMain.handle('get-always-on-top', () => {
  if (mainWindow) {
    return mainWindow.isAlwaysOnTop();
  }
  return false;
});

// Update play state from renderer and update tray icon
ipcMain.on('update-play-state', (event, playing) => {
  isPlaying = playing;
  updateTrayIcon();
});

// Show window from tray
ipcMain.on('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Splash screen progress updates from renderer
ipcMain.on('splash-progress', (event, progress, message) => {
  updateSplashProgress(progress, message);
});

// Main window ready - show it and close splash
ipcMain.on('app-ready', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    closeSplashWindow();
  }
});

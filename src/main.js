// Cassette Music Player - Main Process
// Electron main process for the standalone cassette music player

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Configure portable mode before accessing userData
// In portable mode, all app data is stored relative to the executable
const isPortable = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;

if (isPortable) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const portableUserData = path.join(portableDir, 'UserData');

  try {
    // Ensure UserData directory exists
    if (!fs.existsSync(portableUserData)) {
      fs.mkdirSync(portableUserData, { recursive: true });
    }

    // Set all storage paths to be within UserData folder
    // This prevents Electron from creating additional folders next to the executable
    app.setPath('userData', portableUserData);
    app.setPath('sessionData', portableUserData);

    console.log('[Portable Mode] All app data will be stored in:', portableUserData);
  } catch (error) {
    console.error('[Portable Mode] Failed to configure portable storage paths:', error);
    // Fall back to default behavior
  }
}

// Settings file path in user data directory
// In portable mode: <exe-dir>/UserData/settings.json
// In installed mode: C:\Users\<user>\AppData\Local\cassette-music-player\settings.json
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

// Default settings
const DEFAULT_SETTINGS = {
  audio: {
    volume: 0.7,
    tapeHissLevel: 0.3,
    wowFlutterLevel: 0.5,
    saturationLevel: 0.4,
    lowCutoff: 80,
    highCutoff: 12000,
    effectsEnabled: true
  },
  appearance: {
    gradientEnabled: false,
    gradientStartColor: '#1a1a2e',
    gradientEndColor: '#2a2a4e',
    gradientAngle: 180,
    backgroundOpacity: 80
  },
  window: {
    alwaysOnTop: false
  },
  playback: {
    folderPath: null,
    currentTrackIndex: 0,
    shuffleEnabled: false,
    shuffledPlaylist: []
  }
};

// Load settings from file
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      // Merge with defaults to handle missing keys from older versions
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...loaded.audio },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...loaded.appearance },
        window: { ...DEFAULT_SETTINGS.window, ...loaded.window },
        playback: { ...DEFAULT_SETTINGS.playback, ...loaded.playback }
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

// Save settings to file
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Current settings (loaded on app start)
let currentSettings = null;

// Keep a global reference of the window object
let mainWindow = null;
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

function createWindow() {
  // Create the browser window with transparent, frameless design
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 70,
    minHeight: 70,
    frame: false,
    transparent: true,
    resizable: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

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

  // Lock aspect ratio to 5:4 (same as initial window size 500x400)
  mainWindow.setAspectRatio(5 / 4);

  // Remove default menu for cleaner look
  Menu.setApplicationMenu(null);
}

// Create window when Electron is ready
app.whenReady().then(() => {
  // Load settings before creating window
  currentSettings = loadSettings();
  createWindow();
  createTray();

  // Apply saved always-on-top setting
  if (currentSettings.window.alwaysOnTop && mainWindow) {
    mainWindow.setAlwaysOnTop(true);
  }
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

// Get audio files from a folder (recursively scans subfolders)
function getAudioFilesFromFolder(folderPath) {
  try {
    return getAudioFilesRecursive(folderPath).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error reading folder:', error);
    return [];
  }
}

// Recursively get audio files from folder and all subfolders
function getAudioFilesRecursive(folderPath) {
  let audioFiles = [];

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        audioFiles = audioFiles.concat(getAudioFilesRecursive(fullPath));
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        audioFiles.push({
          name: getFileDisplayName(entry.name),
          fullName: entry.name,
          path: fullPath
        });
      }
    }
  } catch (error) {
    console.error('Error reading folder:', folderPath, error);
  }

  return audioFiles;
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

// Always on top handler - get current state
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

// Settings handlers
ipcMain.handle('get-settings', () => {
  return currentSettings;
});

ipcMain.on('save-settings', (event, settings) => {
  currentSettings = settings;
  saveSettings(settings);
});

// Update always-on-top setting and save
ipcMain.on('set-always-on-top', (event, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(value);
  }
  // Also save to settings (ensure window property exists)
  if (currentSettings) {
    if (!currentSettings.window) {
      currentSettings.window = { ...DEFAULT_SETTINGS.window };
    }
    currentSettings.window.alwaysOnTop = value;
    saveSettings(currentSettings);
  }
});

// Get audio files from a specific folder path (for restoring playback state)
ipcMain.handle('get-audio-files-from-path', async (event, folderPath) => {
  try {
    // Check if the folder still exists
    if (!fs.existsSync(folderPath)) {
      return null;
    }

    const audioFiles = getAudioFilesFromFolder(folderPath);
    return {
      folderPath,
      audioFiles
    };
  } catch (error) {
    console.error('Error getting audio files from path:', error);
    return null;
  }
});

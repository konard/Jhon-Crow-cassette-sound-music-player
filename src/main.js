// Cassette Music Player - Main Process
// Electron main process for the standalone cassette music player

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm', '.opus', '.wma'];

function createWindow() {
  // Create the browser window with transparent, frameless design
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    minWidth: 400,
    minHeight: 320,
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

  // Remove default menu for cleaner look
  Menu.setApplicationMenu(null);
}

// Create window when Electron is ready
app.whenReady().then(createWindow);

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

// Drag window
ipcMain.on('window-start-drag', () => {
  // Window dragging is handled in renderer via -webkit-app-region: drag
});

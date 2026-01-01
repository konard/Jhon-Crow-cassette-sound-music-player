// Cassette Music Player - Splash Screen Preload Script
// Exposes progress update method to the splash renderer

const { contextBridge, ipcRenderer } = require('electron');

// Expose progress listener to the splash screen
contextBridge.exposeInMainWorld('electronAPI', {
  onProgress: (callback) => {
    ipcRenderer.on('splash-progress', (event, progress, message) => {
      callback(progress, message);
    });
  }
});

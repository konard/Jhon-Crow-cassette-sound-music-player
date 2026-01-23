/**
 * Test script to simulate the exact settings flow for Always on Top persistence
 * This test mimics what happens in the Electron app to identify the bug.
 */

const fs = require('fs');
const path = require('path');

// Temporary settings file for testing
const TEST_SETTINGS_FILE = path.join(__dirname, 'test-settings.json');

// Default settings (from main.js)
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
  ui: {
    showControlsHint: true
  },
  playback: {
    folderPath: null,
    currentTrackIndex: 0
  }
};

// Simulated main process state
let currentSettings = null;
let windowAlwaysOnTop = false; // Simulates mainWindow.isAlwaysOnTop()

// Load settings from file (from main.js)
function loadSettings() {
  try {
    if (fs.existsSync(TEST_SETTINGS_FILE)) {
      const data = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...loaded.audio },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...loaded.appearance },
        window: { ...DEFAULT_SETTINGS.window, ...loaded.window },
        ui: { ...DEFAULT_SETTINGS.ui, ...loaded.ui },
        playback: { ...DEFAULT_SETTINGS.playback, ...loaded.playback }
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

// Save settings to file (from main.js)
function saveSettings(settings) {
  try {
    fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    console.log('  [main] Saved settings to file:', JSON.stringify(settings.window));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// IPC handler for set-always-on-top (from main.js)
function handleSetAlwaysOnTop(value) {
  console.log(`  [main] set-always-on-top received: ${value}`);
  // mainWindow.setAlwaysOnTop(value)
  windowAlwaysOnTop = value;
  console.log(`  [main] Window always on top set to: ${windowAlwaysOnTop}`);

  // Also save to settings
  if (currentSettings) {
    if (!currentSettings.window) {
      currentSettings.window = { ...DEFAULT_SETTINGS.window };
    }
    currentSettings.window.alwaysOnTop = value;
    saveSettings(currentSettings);
  }
}

// IPC handler for get-always-on-top (from main.js)
function handleGetAlwaysOnTop() {
  console.log(`  [main] get-always-on-top returning: ${windowAlwaysOnTop}`);
  return windowAlwaysOnTop;
}

// IPC handler for save-settings (from main.js - THE FIXED VERSION)
function handleSaveSettings(settings) {
  console.log('  [main] save-settings received with window:', JSON.stringify(settings.window));

  // Merge incoming settings with current settings
  // IMPORTANT: Preserve the window settings from currentSettings
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    appearance: { ...currentSettings?.appearance, ...settings.appearance },
    window: { ...currentSettings?.window },  // Preserve window settings from main process
    ui: { ...currentSettings?.ui, ...settings.ui },
    playback: { ...currentSettings?.playback, ...settings.playback }
  };
  console.log('  [main] After merge, currentSettings.window:', JSON.stringify(currentSettings.window));
  saveSettings(currentSettings);
}

// Simulated renderer's saveCurrentSettings (from renderer.js)
async function rendererSaveCurrentSettings() {
  console.log('  [renderer] saveCurrentSettings called');

  // Get current always-on-top state from main process
  const alwaysOnTop = handleGetAlwaysOnTop();
  console.log(`  [renderer] Got alwaysOnTop: ${alwaysOnTop}`);

  const settings = {
    audio: { volume: 0.7 },
    appearance: { gradientEnabled: false },
    window: {
      alwaysOnTop: alwaysOnTop
    },
    ui: { showControlsHint: true },
    playback: { folderPath: null, currentTrackIndex: 0 }
  };

  console.log('  [renderer] Sending settings with window:', JSON.stringify(settings.window));
  handleSaveSettings(settings);
}

// App startup simulation
function appStartup() {
  console.log('\n--- APP STARTUP ---');
  currentSettings = loadSettings();
  console.log('  [main] Loaded settings, window:', JSON.stringify(currentSettings.window));

  // Apply saved always-on-top setting
  if (currentSettings.window && currentSettings.window.alwaysOnTop) {
    windowAlwaysOnTop = true;
    console.log('  [main] Applied always-on-top from settings: true');
  } else {
    windowAlwaysOnTop = false;
    console.log('  [main] Always-on-top not set in settings, window state: false');
  }
}

// Cleanup
function cleanup() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    fs.unlinkSync(TEST_SETTINGS_FILE);
  }
}

// Run tests
console.log('='.repeat(60));
console.log('TEST: Always on Top Persistence Flow');
console.log('='.repeat(60));

// Clean start
cleanup();

// Test 1: First run - toggle on and close settings
console.log('\n=== TEST 1: First run - enable Always on Top ===');
appStartup();

console.log('\n--- USER ACTION: Toggle "Always on Top" ON ---');
handleSetAlwaysOnTop(true);

console.log('\n--- USER ACTION: Close settings panel ---');
rendererSaveCurrentSettings();

console.log('\n--- APP SHUTDOWN (simulated) ---');
console.log('  [main] Current settings saved, window:', JSON.stringify(currentSettings.window));

// Test 2: Second run - check if setting was restored
console.log('\n\n=== TEST 2: Second run - check persistence ===');
windowAlwaysOnTop = false; // Reset window state
currentSettings = null;

appStartup();

if (windowAlwaysOnTop) {
  console.log('\n✅ SUCCESS: Always on Top was restored correctly!');
} else {
  console.log('\n❌ FAILURE: Always on Top was NOT restored!');
  console.log('   Expected: true, Got: false');
}

// Test 3: Toggle off and verify
console.log('\n\n=== TEST 3: Disable Always on Top ===');
console.log('\n--- USER ACTION: Toggle "Always on Top" OFF ---');
handleSetAlwaysOnTop(false);

console.log('\n--- USER ACTION: Close settings panel ---');
rendererSaveCurrentSettings();

console.log('\n--- APP RESTART ---');
windowAlwaysOnTop = true; // Reset to opposite
currentSettings = null;

appStartup();

if (!windowAlwaysOnTop) {
  console.log('\n✅ SUCCESS: Always on Top OFF was restored correctly!');
} else {
  console.log('\n❌ FAILURE: Always on Top OFF was NOT restored!');
}

// Final cleanup
cleanup();

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));

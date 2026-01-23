/**
 * Test the actual file operations for settings persistence
 * This simulates exactly what happens with the real settings file
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// This is where Electron stores settings on Linux/Windows
// On Linux: ~/.config/{app-name}/settings.json
// On Windows: %APPDATA%/{app-name}/settings.json
// On Mac: ~/Library/Application Support/{app-name}/settings.json

// For testing, we'll use a temp directory
const TEST_USER_DATA = path.join(__dirname, 'test-user-data');
const SETTINGS_FILE = path.join(TEST_USER_DATA, 'settings.json');

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

function ensureDirectoryExists() {
  if (!fs.existsSync(TEST_USER_DATA)) {
    fs.mkdirSync(TEST_USER_DATA, { recursive: true });
    console.log(`Created directory: ${TEST_USER_DATA}`);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      console.log(`Read from file: ${data}`);
      const loaded = JSON.parse(data);
      // Merge with defaults
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...loaded.audio },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...loaded.appearance },
        window: { ...DEFAULT_SETTINGS.window, ...loaded.window },
        ui: { ...DEFAULT_SETTINGS.ui, ...loaded.ui },
        playback: { ...DEFAULT_SETTINGS.playback, ...loaded.playback }
      };
    }
    console.log('Settings file does not exist, using defaults');
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    ensureDirectoryExists();
    const data = JSON.stringify(settings, null, 2);
    fs.writeFileSync(SETTINGS_FILE, data, 'utf8');
    console.log(`Wrote to file: ${data}`);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function cleanup() {
  if (fs.existsSync(SETTINGS_FILE)) {
    fs.unlinkSync(SETTINGS_FILE);
  }
  if (fs.existsSync(TEST_USER_DATA)) {
    fs.rmdirSync(TEST_USER_DATA);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Actual File Operations');
  console.log('='.repeat(60));
  console.log(`Settings file: ${SETTINGS_FILE}\n`);

  cleanup();
  ensureDirectoryExists();

  // Simulate first app launch
  console.log('=== First App Launch ===');
  let currentSettings = loadSettings();
  console.log(`Loaded settings.window: ${JSON.stringify(currentSettings.window)}`);

  // User enables Always on Top
  console.log('\n=== User Enables Always on Top ===');
  currentSettings.window.alwaysOnTop = true;
  saveSettings(currentSettings);

  // Simulate app close and restart
  console.log('\n=== App Restart ===');
  currentSettings = null;
  currentSettings = loadSettings();
  console.log(`After restart, settings.window: ${JSON.stringify(currentSettings.window)}`);

  if (currentSettings.window.alwaysOnTop === true) {
    console.log('\n✅ SUCCESS: Always on Top was persisted correctly!');
  } else {
    console.log('\n❌ FAILURE: Always on Top was NOT persisted!');
  }

  // Now test the scenario where save-settings is called with merged data
  console.log('\n\n=== Testing save-settings Merge Behavior ===');
  cleanup();
  ensureDirectoryExists();

  // Initial state
  currentSettings = loadSettings();
  console.log(`Initial state: ${JSON.stringify(currentSettings.window)}`);

  // User enables Always on Top (via set-always-on-top handler)
  console.log('\n[set-always-on-top] Setting to true...');
  currentSettings.window.alwaysOnTop = true;
  saveSettings(currentSettings);

  // Now save-settings is called with incoming settings
  // that might have stale window value
  console.log('\n[save-settings] Incoming settings with stale window value...');
  const incomingSettings = {
    audio: { volume: 0.8 },
    appearance: { gradientEnabled: true },
    window: { alwaysOnTop: false },  // STALE value from race condition
    ui: { showControlsHint: false },
    playback: { folderPath: '/music' }
  };

  // Apply the FIX: preserve window from currentSettings
  currentSettings = {
    audio: { ...currentSettings?.audio, ...incomingSettings.audio },
    appearance: { ...currentSettings?.appearance, ...incomingSettings.appearance },
    window: { ...currentSettings?.window },  // PRESERVE from main process
    ui: { ...currentSettings?.ui, ...incomingSettings.ui },
    playback: { ...currentSettings?.playback, ...incomingSettings.playback }
  };
  saveSettings(currentSettings);

  // Verify
  console.log(`\nAfter merge, settings.window: ${JSON.stringify(currentSettings.window)}`);

  // Restart
  console.log('\n=== Simulating App Restart ===');
  currentSettings = null;
  currentSettings = loadSettings();
  console.log(`After restart, settings.window: ${JSON.stringify(currentSettings.window)}`);

  if (currentSettings.window.alwaysOnTop === true) {
    console.log('\n✅ SUCCESS: Always on Top was preserved correctly!');
  } else {
    console.log('\n❌ FAILURE: Always on Top was lost!');
  }

  // Show final file contents
  console.log('\n=== Final Settings File Contents ===');
  console.log(fs.readFileSync(SETTINGS_FILE, 'utf8'));

  cleanup();
}

main();

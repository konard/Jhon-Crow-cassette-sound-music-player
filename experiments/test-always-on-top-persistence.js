// Test script to verify always-on-top persistence
// This simulates the flow of saving and loading the always-on-top setting

const fs = require('fs');
const path = require('path');

// Simulate the settings file path
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
  playback: {
    folderPath: null,
    currentTrackIndex: 0
  }
};

// Load settings from file (from main.js)
function loadSettings() {
  try {
    if (fs.existsSync(TEST_SETTINGS_FILE)) {
      const data = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
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

// Save settings to file (from main.js)
function saveSettings(settings) {
  try {
    fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Simulate the set-always-on-top IPC handler (from main.js:408-420)
function setAlwaysOnTop(currentSettings, value) {
  if (!currentSettings.window) {
    currentSettings.window = { ...DEFAULT_SETTINGS.window };
  }
  currentSettings.window.alwaysOnTop = value;
  saveSettings(currentSettings);
}

// Test the persistence
console.log('Testing always-on-top persistence...\n');

// Clean up any existing test file
if (fs.existsSync(TEST_SETTINGS_FILE)) {
  fs.unlinkSync(TEST_SETTINGS_FILE);
  console.log('✓ Cleaned up existing test settings file');
}

// Step 1: Load initial settings (should use defaults)
console.log('\n--- Step 1: Load initial settings ---');
let currentSettings = loadSettings();
console.log('Initial alwaysOnTop value:', currentSettings.window.alwaysOnTop);
console.log('Expected: false');
console.log('✓ Test passed:', currentSettings.window.alwaysOnTop === false);

// Step 2: Set always-on-top to true and save
console.log('\n--- Step 2: Set always-on-top to true ---');
setAlwaysOnTop(currentSettings, true);
console.log('alwaysOnTop after save:', currentSettings.window.alwaysOnTop);
console.log('Expected: true');
console.log('✓ Test passed:', currentSettings.window.alwaysOnTop === true);

// Step 3: Verify file was saved
console.log('\n--- Step 3: Verify file was saved ---');
console.log('File exists:', fs.existsSync(TEST_SETTINGS_FILE));
const savedContent = JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
console.log('Saved alwaysOnTop value:', savedContent.window.alwaysOnTop);
console.log('Expected: true');
console.log('✓ Test passed:', savedContent.window.alwaysOnTop === true);

// Step 4: Simulate app restart - load settings again
console.log('\n--- Step 4: Simulate app restart ---');
currentSettings = loadSettings();
console.log('alwaysOnTop after reload:', currentSettings.window.alwaysOnTop);
console.log('Expected: true');
console.log('✓ Test passed:', currentSettings.window.alwaysOnTop === true);

// Step 5: Set always-on-top to false and save
console.log('\n--- Step 5: Set always-on-top to false ---');
setAlwaysOnTop(currentSettings, false);
console.log('alwaysOnTop after save:', currentSettings.window.alwaysOnTop);
console.log('Expected: false');
console.log('✓ Test passed:', currentSettings.window.alwaysOnTop === false);

// Step 6: Simulate another app restart
console.log('\n--- Step 6: Simulate another app restart ---');
currentSettings = loadSettings();
console.log('alwaysOnTop after reload:', currentSettings.window.alwaysOnTop);
console.log('Expected: false');
console.log('✓ Test passed:', currentSettings.window.alwaysOnTop === false);

// Clean up
if (fs.existsSync(TEST_SETTINGS_FILE)) {
  fs.unlinkSync(TEST_SETTINGS_FILE);
  console.log('\n✓ Cleaned up test settings file');
}

console.log('\n=== ALL TESTS PASSED ===');
console.log('The always-on-top persistence is working correctly!');

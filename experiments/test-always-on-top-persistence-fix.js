/**
 * Test script for verifying the Always on Top persistence fix
 *
 * This test simulates the exact bug scenario:
 * 1. User enables Always on Top
 * 2. User closes settings panel (triggers saveCurrentSettings)
 * 3. App restarts
 * 4. Always on Top should still be enabled
 *
 * Run: node experiments/test-always-on-top-persistence-fix.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Simulate the settings file path (as in main.js)
const TEST_SETTINGS_FILE = path.join(os.tmpdir(), 'cassette-player-test-settings.json');

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
let windowAlwaysOnTop = false;

// Load settings (simulating main.js loadSettings)
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

// Save settings (simulating main.js saveSettings)
function saveSettings(settings) {
  try {
    fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Simulate IPC: save-settings handler (main.js)
function handleSaveSettings(settings) {
  currentSettings = settings;
  saveSettings(settings);
}

// Simulate IPC: set-always-on-top handler (main.js)
function handleSetAlwaysOnTop(value) {
  windowAlwaysOnTop = value;
  if (currentSettings) {
    if (!currentSettings.window) {
      currentSettings.window = { ...DEFAULT_SETTINGS.window };
    }
    currentSettings.window.alwaysOnTop = value;
    saveSettings(currentSettings);
  }
}

// Simulate IPC: get-always-on-top handler (main.js)
function handleGetAlwaysOnTop() {
  return windowAlwaysOnTop;
}

// ============================================================================
// OLD saveCurrentSettings (BUG - does NOT include window settings)
// ============================================================================
function oldSaveCurrentSettings() {
  const settings = {
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
    ui: {
      showControlsHint: true
    },
    playback: {
      folderPath: null,
      currentTrackIndex: 0
    }
    // MISSING: window: { alwaysOnTop: ... }
  };
  handleSaveSettings(settings);
}

// ============================================================================
// NEW saveCurrentSettings (FIX - includes window settings)
// ============================================================================
function newSaveCurrentSettings() {
  // Get current always-on-top state from main process to preserve it
  const alwaysOnTop = handleGetAlwaysOnTop();

  const settings = {
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
      alwaysOnTop: alwaysOnTop  // NOW INCLUDED!
    },
    ui: {
      showControlsHint: true
    },
    playback: {
      folderPath: null,
      currentTrackIndex: 0
    }
  };
  handleSaveSettings(settings);
}

// ============================================================================
// TESTS
// ============================================================================

function cleanUp() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    fs.unlinkSync(TEST_SETTINGS_FILE);
  }
  currentSettings = null;
  windowAlwaysOnTop = false;
}

function testOldBehavior() {
  console.log('\n=== TEST: Old Behavior (BUG) ===\n');
  cleanUp();

  // Step 1: Simulate app start
  currentSettings = loadSettings();
  console.log('1. Initial load - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // Step 2: User enables Always on Top
  handleSetAlwaysOnTop(true);
  console.log('2. After enabling Always on Top - alwaysOnTop:', currentSettings.window?.alwaysOnTop);
  console.log('   Window state (main process):', windowAlwaysOnTop);

  // Let's check what's in the file after setAlwaysOnTop
  const fileAfterSet = JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  console.log('   File after setAlwaysOnTop:', fileAfterSet.window?.alwaysOnTop);

  // Step 3: User closes settings panel (triggers OLD saveCurrentSettings)
  // This is the BUG - it overwrites settings WITHOUT window property
  oldSaveCurrentSettings();
  console.log('3. After old saveCurrentSettings - currentSettings.window:', currentSettings.window);

  // Check what's actually in the file
  const fileAfterSave = JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  console.log('   File contents window property:', fileAfterSave.window);

  // Step 4: Simulate app restart (fresh load from file)
  currentSettings = null;  // Clear memory
  windowAlwaysOnTop = false;  // Clear window state
  currentSettings = loadSettings();
  // Apply saved always-on-top setting (simulating app.whenReady in main.js)
  if (currentSettings.window.alwaysOnTop) {
    windowAlwaysOnTop = true;
  }
  console.log('4. After restart - alwaysOnTop from file:', currentSettings.window?.alwaysOnTop);
  console.log('   Window state (would be applied):', windowAlwaysOnTop);

  // The BUG: The file should have window.alwaysOnTop=true, but oldSaveCurrentSettings
  // overwrote it without the window property. Due to loadSettings merging with defaults,
  // it gets window.alwaysOnTop=false (the default)
  const fileHasCorrectValue = fileAfterSave.window?.alwaysOnTop === true;
  console.log('\n   File has correct window.alwaysOnTop=true:', fileHasCorrectValue ? 'YES' : 'NO (BUG!)');
  return fileHasCorrectValue;
}

function testNewBehavior() {
  console.log('\n=== TEST: New Behavior (FIX) ===\n');
  cleanUp();

  // Step 1: Simulate app start
  currentSettings = loadSettings();
  console.log('1. Initial load - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // Step 2: User enables Always on Top
  handleSetAlwaysOnTop(true);
  console.log('2. After enabling Always on Top - alwaysOnTop:', currentSettings.window?.alwaysOnTop);
  console.log('   Window state (main process):', windowAlwaysOnTop);

  // Step 3: User closes settings panel (triggers NEW saveCurrentSettings)
  newSaveCurrentSettings();
  console.log('3. After new saveCurrentSettings - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // Step 4: Simulate app restart
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('4. After restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);
  console.log('   Window state (main process):', windowAlwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

function testToggleOffPersistence() {
  console.log('\n=== TEST: Toggle Off Persistence (FIX) ===\n');
  cleanUp();

  // Start with always-on-top enabled
  currentSettings = { ...DEFAULT_SETTINGS };
  currentSettings.window.alwaysOnTop = true;
  saveSettings(currentSettings);

  // Simulate app start
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('1. Initial (enabled) - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // User disables Always on Top
  handleSetAlwaysOnTop(false);
  console.log('2. After disabling - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // User closes settings panel
  newSaveCurrentSettings();
  console.log('3. After save - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // Simulate app restart
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('4. After restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === false;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

// Run all tests
console.log('=====================================');
console.log('Always on Top Persistence Fix Tests');
console.log('=====================================');

const oldResult = testOldBehavior();
const newResult = testNewBehavior();
const toggleResult = testToggleOffPersistence();

console.log('\n=====================================');
console.log('Summary');
console.log('=====================================');
console.log('Old behavior (confirms bug):', oldResult ? 'UNEXPECTED PASS' : 'BUG CONFIRMED ✓');
console.log('New behavior (fix works):  ', newResult ? 'PASS ✓' : 'FAIL ✗');
console.log('Toggle off persistence:    ', toggleResult ? 'PASS ✓' : 'FAIL ✗');

// Clean up
cleanUp();

// Exit with appropriate code
if (!newResult || !toggleResult) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

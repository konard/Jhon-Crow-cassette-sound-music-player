/**
 * Test script to simulate async IPC race conditions in settings persistence
 *
 * This test mimics the actual Electron IPC behavior more closely,
 * including the async nature of `invoke` vs `send`.
 *
 * Run: node experiments/test-async-race-condition.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_SETTINGS_FILE = path.join(os.tmpdir(), 'cassette-player-async-test.json');

// Default settings (from main.js)
const DEFAULT_SETTINGS = {
  audio: { volume: 0.7, effectsEnabled: true },
  appearance: { gradientEnabled: false },
  window: { alwaysOnTop: false },
  ui: { showControlsHint: true },
  playback: { folderPath: null, currentTrackIndex: 0 }
};

// ============================================================================
// SIMULATED MAIN PROCESS
// ============================================================================
let currentSettings = null;
let windowAlwaysOnTop = false;

function loadSettings() {
  try {
    if (fs.existsSync(TEST_SETTINGS_FILE)) {
      const data = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
      const loaded = JSON.parse(data);
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

function saveSettingsToFile(settings) {
  fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// Simulate IPC handlers with realistic async delays
// ipcMain.on('save-settings', ...) - fire-and-forget from renderer
async function handleSaveSettings(settings) {
  // Simulate IPC delay (very small, but non-zero)
  await delay(1);
  currentSettings = settings;
  saveSettingsToFile(settings);
  console.log('  [Main] save-settings: saved settings, window.alwaysOnTop =', settings.window?.alwaysOnTop);
}

// ipcMain.on('set-always-on-top', ...) - fire-and-forget from renderer
async function handleSetAlwaysOnTop(value) {
  // Simulate IPC delay
  await delay(1);
  windowAlwaysOnTop = value;
  if (currentSettings) {
    if (!currentSettings.window) {
      currentSettings.window = { ...DEFAULT_SETTINGS.window };
    }
    currentSettings.window.alwaysOnTop = value;
    saveSettingsToFile(currentSettings);
    console.log('  [Main] set-always-on-top: set to', value, 'and saved');
  }
}

// ipcMain.handle('get-always-on-top', ...) - returns promise
async function handleGetAlwaysOnTop() {
  // Simulate IPC delay
  await delay(1);
  console.log('  [Main] get-always-on-top: returning', windowAlwaysOnTop);
  return windowAlwaysOnTop;
}

// ============================================================================
// SIMULATED RENDERER PROCESS (electron API wrappers)
// ============================================================================
const electronAPI = {
  // ipcRenderer.send - fire and forget
  setAlwaysOnTop: (value) => {
    console.log('  [Renderer] setAlwaysOnTop called with', value);
    // Fire-and-forget - doesn't wait
    handleSetAlwaysOnTop(value);
  },

  // ipcRenderer.invoke - returns promise
  getAlwaysOnTop: async () => {
    console.log('  [Renderer] getAlwaysOnTop called');
    return await handleGetAlwaysOnTop();
  },

  // ipcRenderer.send - fire and forget
  saveSettings: (settings) => {
    console.log('  [Renderer] saveSettings called');
    // Fire-and-forget - doesn't wait
    handleSaveSettings(settings);
  }
};

// ============================================================================
// SIMULATED RENDERER CODE (from renderer.js)
// ============================================================================
const CONFIG = {
  audio: { volume: 0.7, effectsEnabled: true },
  appearance: { gradientEnabled: false },
  ui: { showControlsHint: true }
};
const audioState = { folderPath: null, currentTrackIndex: 0 };

// Current fix: async function that queries getAlwaysOnTop
async function saveCurrentSettings() {
  // Get current always-on-top state from main process to preserve it
  let alwaysOnTop = false;
  alwaysOnTop = await electronAPI.getAlwaysOnTop();
  console.log('  [Renderer] saveCurrentSettings: got alwaysOnTop =', alwaysOnTop);

  const settings = {
    audio: { volume: CONFIG.audio.volume, effectsEnabled: CONFIG.audio.effectsEnabled },
    appearance: { gradientEnabled: CONFIG.appearance.gradientEnabled },
    window: { alwaysOnTop: alwaysOnTop },
    ui: { showControlsHint: CONFIG.ui.showControlsHint },
    playback: { folderPath: audioState.folderPath, currentTrackIndex: audioState.currentTrackIndex }
  };
  electronAPI.saveSettings(settings);
}

// Checkbox change handler
function onAlwaysOnTopCheckboxChange(checked) {
  console.log('  [Renderer] Checkbox changed to', checked);
  electronAPI.setAlwaysOnTop(checked);
}

// Close settings (triggers save)
async function closeSettings() {
  console.log('  [Renderer] closeSettings called');
  await saveCurrentSettings();
}

// ============================================================================
// UTILITY
// ============================================================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanUp() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    fs.unlinkSync(TEST_SETTINGS_FILE);
  }
  currentSettings = null;
  windowAlwaysOnTop = false;
}

function readSettingsFile() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  }
  return null;
}

// ============================================================================
// TESTS
// ============================================================================

async function testNormalFlow() {
  console.log('\n=== TEST 1: Normal Flow (checkbox then close after delay) ===\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('1. App start - window.alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // User checks Always on Top
  onAlwaysOnTopCheckboxChange(true);

  // Wait for IPC to complete
  await delay(50);
  console.log('2. After checkbox (with delay) - file:', readSettingsFile()?.window?.alwaysOnTop);

  // User closes settings
  await closeSettings();

  // Wait for IPC to complete
  await delay(50);
  console.log('3. After closeSettings (with delay) - file:', readSettingsFile()?.window?.alwaysOnTop);

  // Simulate restart
  currentSettings = null;
  windowAlwaysOnTop = false;
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('4. After restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function testRaceCondition() {
  console.log('\n=== TEST 2: Race Condition (checkbox then immediate close) ===\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('1. App start - window.alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  // User checks Always on Top AND IMMEDIATELY closes settings
  // This simulates clicking checkbox then clicking close button very fast
  onAlwaysOnTopCheckboxChange(true);
  // NO DELAY - immediate closeSettings call
  await closeSettings();

  // Wait for all IPC to complete
  await delay(50);
  console.log('2. After all IPC completes - file:', readSettingsFile()?.window?.alwaysOnTop);

  // Simulate restart
  currentSettings = null;
  windowAlwaysOnTop = false;
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('3. After restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function testSequenceAnalysis() {
  console.log('\n=== TEST 3: Detailed Sequence Analysis ===\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('Step 1: App started, currentSettings.window.alwaysOnTop =', currentSettings.window?.alwaysOnTop);
  console.log('        windowAlwaysOnTop (main process state) =', windowAlwaysOnTop);
  console.log('');

  // User checks Always on Top
  console.log('Step 2: User clicks Always on Top checkbox');
  onAlwaysOnTopCheckboxChange(true);
  console.log('        (IPC message sent, but not yet processed)');
  console.log('');

  // User immediately closes settings
  console.log('Step 3: User closes settings panel (calls saveCurrentSettings)');
  console.log('        saveCurrentSettings() calls getAlwaysOnTop()...');

  // This is where the race condition happens:
  // - setAlwaysOnTop(true) IPC was sent but might not be processed yet
  // - getAlwaysOnTop() is called and might return the OLD value (false)

  await closeSettings();
  console.log('');

  // Wait for all IPC
  await delay(50);

  console.log('Step 4: All IPC completed. Checking file...');
  const fileContents = readSettingsFile();
  console.log('        File window.alwaysOnTop =', fileContents?.window?.alwaysOnTop);
  console.log('');

  // Simulate restart
  currentSettings = null;
  windowAlwaysOnTop = false;
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('Step 5: App restarted');
  console.log('        Loaded alwaysOnTop =', currentSettings.window?.alwaysOnTop);
  console.log('        Window will be on top:', windowAlwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

// Run all tests
async function runTests() {
  console.log('=====================================');
  console.log('Async Race Condition Tests');
  console.log('=====================================');

  const test1 = await testNormalFlow();
  const test2 = await testRaceCondition();
  const test3 = await testSequenceAnalysis();

  console.log('\n=====================================');
  console.log('Summary');
  console.log('=====================================');
  console.log('Test 1 (Normal flow):      ', test1 ? 'PASS ✓' : 'FAIL ✗');
  console.log('Test 2 (Race condition):   ', test2 ? 'PASS ✓' : 'FAIL ✗');
  console.log('Test 3 (Sequence analysis):', test3 ? 'PASS ✓' : 'FAIL ✗');

  cleanUp();

  if (!test1 || !test2 || !test3) {
    console.log('\n❌ Some tests failed! Race condition detected!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests();

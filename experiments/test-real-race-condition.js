/**
 * Test script to simulate REAL async IPC race conditions
 *
 * This test more accurately simulates IPC where:
 * - Messages can have different latencies
 * - The order of processing might differ from the order of sending
 *
 * Run: node experiments/test-real-race-condition.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_SETTINGS_FILE = path.join(os.tmpdir(), 'cassette-player-real-race-test.json');

// Default settings
const DEFAULT_SETTINGS = {
  audio: { volume: 0.7 },
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
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettingsToFile(settings) {
  fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// IPC handlers with configurable delays to simulate real-world conditions
async function handleSetAlwaysOnTop(value, delayMs = 5) {
  await delay(delayMs);
  windowAlwaysOnTop = value;
  if (currentSettings) {
    if (!currentSettings.window) {
      currentSettings.window = { ...DEFAULT_SETTINGS.window };
    }
    currentSettings.window.alwaysOnTop = value;
    saveSettingsToFile(currentSettings);
    console.log(`  [Main] set-always-on-top(${value}): saved after ${delayMs}ms`);
  }
}

async function handleGetAlwaysOnTop(delayMs = 2) {
  await delay(delayMs);
  console.log(`  [Main] get-always-on-top(): returning ${windowAlwaysOnTop} after ${delayMs}ms`);
  return windowAlwaysOnTop;
}

async function handleSaveSettings(settings, delayMs = 3) {
  await delay(delayMs);
  currentSettings = settings;
  saveSettingsToFile(settings);
  console.log(`  [Main] save-settings: window.alwaysOnTop=${settings.window?.alwaysOnTop} after ${delayMs}ms`);
}

// ============================================================================
// SIMULATED RENDERER CODE
// ============================================================================
const CONFIG = { audio: { volume: 0.7 }, appearance: { gradientEnabled: false }, ui: { showControlsHint: true } };
const audioState = { folderPath: null, currentTrackIndex: 0 };

// Current implementation: async saveCurrentSettings that queries getAlwaysOnTop
async function saveCurrentSettings() {
  let alwaysOnTop = false;
  alwaysOnTop = await handleGetAlwaysOnTop(2);
  console.log(`  [Renderer] saveCurrentSettings: got alwaysOnTop=${alwaysOnTop}`);

  const settings = {
    audio: { volume: CONFIG.audio.volume },
    appearance: { gradientEnabled: CONFIG.appearance.gradientEnabled },
    window: { alwaysOnTop: alwaysOnTop },
    ui: { showControlsHint: CONFIG.ui.showControlsHint },
    playback: { folderPath: audioState.folderPath, currentTrackIndex: audioState.currentTrackIndex }
  };

  // Fire-and-forget - don't await
  handleSaveSettings(settings, 3);
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

function readFile() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  }
  return null;
}

// ============================================================================
// TESTS
// ============================================================================

async function testScenario1_SlowSetAlwaysOnTop() {
  console.log('\n=== SCENARIO 1: set-always-on-top is SLOW ===');
  console.log('User enables Always on Top, then IMMEDIATELY closes settings.');
  console.log('set-always-on-top takes 10ms, getAlwaysOnTop takes 2ms.\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('1. App started. windowAlwaysOnTop =', windowAlwaysOnTop);

  // User enables Always on Top (SLOW - 10ms)
  console.log('2. User clicks checkbox -> setAlwaysOnTop(true) sent');
  handleSetAlwaysOnTop(true, 10);  // Fire-and-forget, SLOW

  // User IMMEDIATELY closes settings
  console.log('3. User clicks close -> saveCurrentSettings() called');
  await saveCurrentSettings();  // getAlwaysOnTop is FAST (2ms), returns BEFORE set-always-on-top finishes!

  await delay(50);
  console.log('4. All IPC done. File:', JSON.stringify(readFile()?.window));

  // Restart
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗ (Race condition!)');
  return passed;
}

async function testScenario2_NormalTiming() {
  console.log('\n=== SCENARIO 2: Normal timing (set-always-on-top completes first) ===');
  console.log('set-always-on-top takes 2ms, getAlwaysOnTop takes 5ms.\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('1. App started. windowAlwaysOnTop =', windowAlwaysOnTop);

  // User enables Always on Top (FAST - 2ms)
  console.log('2. User clicks checkbox -> setAlwaysOnTop(true) sent');
  handleSetAlwaysOnTop(true, 2);  // Fire-and-forget, FAST

  // User immediately closes settings
  console.log('3. User clicks close -> saveCurrentSettings() called');
  await saveCurrentSettings();  // getAlwaysOnTop is SLOW (5ms), returns AFTER set-always-on-top

  await delay(50);
  console.log('4. All IPC done. File:', JSON.stringify(readFile()?.window));

  // Restart
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function testScenario3_WithDelay() {
  console.log('\n=== SCENARIO 3: User waits before closing ===');
  console.log('set-always-on-top takes 10ms, user waits 50ms, then closes.\n');
  cleanUp();

  // App start
  currentSettings = loadSettings();
  console.log('1. App started. windowAlwaysOnTop =', windowAlwaysOnTop);

  // User enables Always on Top
  console.log('2. User clicks checkbox -> setAlwaysOnTop(true) sent');
  handleSetAlwaysOnTop(true, 10);

  // User waits a bit
  await delay(50);
  console.log('3. User waited 50ms...');

  // Then closes settings
  console.log('4. User clicks close -> saveCurrentSettings() called');
  await saveCurrentSettings();

  await delay(50);
  console.log('5. All IPC done. File:', JSON.stringify(readFile()?.window));

  // Restart
  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('6. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

// Run all tests
async function runTests() {
  console.log('=====================================');
  console.log('Real Race Condition Tests');
  console.log('=====================================');

  const scenario1 = await testScenario1_SlowSetAlwaysOnTop();
  const scenario2 = await testScenario2_NormalTiming();
  const scenario3 = await testScenario3_WithDelay();

  console.log('\n=====================================');
  console.log('Summary');
  console.log('=====================================');
  console.log('Scenario 1 (SLOW set-always-on-top):   ', scenario1 ? 'PASS ✓' : 'FAIL ✗ <-- RACE CONDITION!');
  console.log('Scenario 2 (Normal timing):            ', scenario2 ? 'PASS ✓' : 'FAIL ✗');
  console.log('Scenario 3 (User waits before close):  ', scenario3 ? 'PASS ✓' : 'FAIL ✗');

  cleanUp();

  if (!scenario1 || !scenario2 || !scenario3) {
    console.log('\n❌ Race condition detected!');
    console.log('\nThe issue: When set-always-on-top is slower than getAlwaysOnTop,');
    console.log('the getAlwaysOnTop() call returns the OLD value (false) before');
    console.log('set-always-on-top has finished updating windowAlwaysOnTop.');
    console.log('\nThis explains why the user\'s fix doesn\'t work!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests();

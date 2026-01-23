/**
 * Final race condition test - this time save-settings is SLOWER than set-always-on-top
 *
 * Run: node experiments/test-race-condition-final.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_SETTINGS_FILE = path.join(os.tmpdir(), 'cassette-player-final-race-test.json');

const DEFAULT_SETTINGS = {
  audio: { volume: 0.7 },
  appearance: { gradientEnabled: false },
  window: { alwaysOnTop: false },
  ui: { showControlsHint: true },
  playback: { folderPath: null, currentTrackIndex: 0 }
};

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

async function handleSetAlwaysOnTop(value, delayMs) {
  await delay(delayMs);
  windowAlwaysOnTop = value;
  if (currentSettings) {
    if (!currentSettings.window) currentSettings.window = { ...DEFAULT_SETTINGS.window };
    currentSettings.window.alwaysOnTop = value;
    saveSettingsToFile(currentSettings);
    console.log(`  [Main] set-always-on-top(${value}): saved after ${delayMs}ms`);
  }
}

async function handleGetAlwaysOnTop(delayMs) {
  await delay(delayMs);
  console.log(`  [Main] get-always-on-top(): returning ${windowAlwaysOnTop} after ${delayMs}ms`);
  return windowAlwaysOnTop;
}

async function handleSaveSettings(settings, delayMs) {
  await delay(delayMs);
  currentSettings = settings;
  saveSettingsToFile(settings);
  console.log(`  [Main] save-settings: window.alwaysOnTop=${settings.window?.alwaysOnTop} after ${delayMs}ms`);
}

const CONFIG = { audio: { volume: 0.7 }, appearance: { gradientEnabled: false }, ui: { showControlsHint: true } };
const audioState = { folderPath: null, currentTrackIndex: 0 };

async function saveCurrentSettings(getDelay, saveDelay) {
  let alwaysOnTop = await handleGetAlwaysOnTop(getDelay);
  console.log(`  [Renderer] saveCurrentSettings: got alwaysOnTop=${alwaysOnTop}`);

  const settings = {
    audio: { volume: CONFIG.audio.volume },
    appearance: { gradientEnabled: CONFIG.appearance.gradientEnabled },
    window: { alwaysOnTop: alwaysOnTop },
    ui: { showControlsHint: CONFIG.ui.showControlsHint },
    playback: { folderPath: audioState.folderPath, currentTrackIndex: audioState.currentTrackIndex }
  };
  handleSaveSettings(settings, saveDelay);  // Fire-and-forget
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanUp() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) fs.unlinkSync(TEST_SETTINGS_FILE);
  currentSettings = null;
  windowAlwaysOnTop = false;
}

function readFile() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  }
  return null;
}

async function testBuggyScenario() {
  console.log('\n=== BUG REPRODUCTION: save-settings finishes LAST ===');
  console.log('Timing: set-always-on-top=5ms, getAlwaysOnTop=2ms, save-settings=10ms');
  console.log('');
  console.log('Expected order:');
  console.log('  1. getAlwaysOnTop returns false (2ms) - WRONG VALUE!');
  console.log('  2. set-always-on-top writes true (5ms)');
  console.log('  3. save-settings writes false (10ms) - OVERWRITES THE TRUE!');
  console.log('');
  cleanUp();

  currentSettings = loadSettings();
  console.log('1. App started. windowAlwaysOnTop =', windowAlwaysOnTop);

  console.log('2. User clicks checkbox -> setAlwaysOnTop(true) sent');
  handleSetAlwaysOnTop(true, 5);  // 5ms

  console.log('3. User clicks close -> saveCurrentSettings() called');
  await saveCurrentSettings(2, 10);  // getAlwaysOnTop=2ms, save-settings=10ms

  await delay(50);
  console.log('');
  console.log('4. All IPC done. File:', JSON.stringify(readFile()?.window));

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗ <-- BUG CONFIRMED!');
  return passed;
}

async function testCorrectScenario() {
  console.log('\n=== CORRECT SCENARIO: save-settings finishes FIRST ===');
  console.log('Timing: set-always-on-top=10ms, getAlwaysOnTop=2ms, save-settings=3ms');
  console.log('');
  cleanUp();

  currentSettings = loadSettings();
  console.log('1. App started. windowAlwaysOnTop =', windowAlwaysOnTop);

  console.log('2. User clicks checkbox -> setAlwaysOnTop(true) sent');
  handleSetAlwaysOnTop(true, 10);  // 10ms

  console.log('3. User clicks close -> saveCurrentSettings() called');
  await saveCurrentSettings(2, 3);  // getAlwaysOnTop=2ms, save-settings=3ms

  await delay(50);
  console.log('');
  console.log('4. All IPC done. File:', JSON.stringify(readFile()?.window));

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function runTests() {
  console.log('=====================================');
  console.log('FINAL Race Condition Test');
  console.log('=====================================');

  const buggy = await testBuggyScenario();
  const correct = await testCorrectScenario();

  console.log('\n=====================================');
  console.log('Summary');
  console.log('=====================================');
  console.log('Buggy scenario (save-settings last):   ', buggy ? 'PASS ✓' : 'FAIL ✗ <-- BUG!');
  console.log('Correct scenario (set-aot last):       ', correct ? 'PASS ✓' : 'FAIL ✗');

  cleanUp();

  if (!buggy) {
    console.log('\n🐛 BUG CONFIRMED!');
    console.log('\nThe race condition exists because:');
    console.log('1. getAlwaysOnTop() returns the OLD value (false) BEFORE set-always-on-top completes');
    console.log('2. save-settings then writes this wrong value');
    console.log('3. If save-settings completes AFTER set-always-on-top, it OVERWRITES the correct value!');
    console.log('\n💡 SOLUTION: Do NOT rely on getAlwaysOnTop() for the value.');
    console.log('   Instead, the checkbox change handler should ALSO call saveCurrentSettings()');
    console.log('   OR save-settings should MERGE with existing settings instead of replacing.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests();
